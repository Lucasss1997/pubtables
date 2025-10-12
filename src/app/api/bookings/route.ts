// src/app/api/bookings/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import bcrypt from "bcryptjs";

const ALLOW_IF_NO_AUTH = true;

async function verifyHostPinForPub(req: Request, pubId: string): Promise<boolean> {
  const pin = (req.headers.get("x-host-pin") || "").trim();
  if (!/^\d{6}$/.test(pin)) return false;

  try {
    const auth = await (prisma as any).hostAuth?.findFirst?.({
      where: { pubId },
      select: { pin: true, pinHash: true },
    });
    if (!auth) return ALLOW_IF_NO_AUTH;
    if (auth.pinHash) return await bcrypt.compare(pin, auth.pinHash);
    if (auth.pin) return auth.pin === pin;
    return ALLOW_IF_NO_AUTH;
  } catch {
    return ALLOW_IF_NO_AUTH;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { slug, tableId, startAt, endAt, partyName, notes } = body as {
      slug?: string; tableId?: string; startAt?: string; endAt?: string;
      partyName?: string | null; notes?: string | null;
    };

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (!tableId) return NextResponse.json({ error: "Missing tableId" }, { status: 400 });
    if (!startAt || !endAt) return NextResponse.json({ error: "Missing startAt/endAt" }, { status: 400 });

    const s = new Date(startAt);
    const e = new Date(endAt);
    if (isNaN(+s)) return NextResponse.json({ error: "Invalid startAt" }, { status: 400 });
    if (isNaN(+e)) return NextResponse.json({ error: "Invalid endAt" }, { status: 400 });
    if (e <= s) return NextResponse.json({ error: "endAt must be after startAt" }, { status: 400 });

    // Server-side guard: no past bookings
    const now = new Date();
    if (s < now) return NextResponse.json({ error: "Cannot create a booking in the past" }, { status: 400 });

    const pub = await prisma.pub.findFirst({ where: { slug }, select: { id: true } });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    const ok = await verifyHostPinForPub(req, pub.id);
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const table = await prisma.table.findFirst({
      where: { id: tableId, pubId: pub.id, active: true },
      select: { id: true },
    });
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    // Overlap checks
    const overlappingBooking = await prisma.booking.findFirst({
      where: { pubId: pub.id, tableId, startAt: { lt: e }, endAt: { gt: s } },
      select: { id: true },
    });
    if (overlappingBooking) return NextResponse.json({ error: "Overlaps an existing booking" }, { status: 409 });

    const overlappingSession = await prisma.session.findFirst({
      where: { pubId: pub.id, tableId, startedAt: { lt: e }, endsAt: { gt: s } },
      select: { id: true },
    });
    if (overlappingSession) return NextResponse.json({ error: "Overlaps a live/session block" }, { status: 409 });

    const created = await prisma.booking.create({
      data: {
        pubId: pub.id,
        tableId,
        startAt: s,
        endAt: e,
        partyName: partyName ?? null,
        notes: notes ?? null,
      },
      select: { id: true, tableId: true, startAt: true, endAt: true, partyName: true, notes: true },
    });

    return NextResponse.json({ ok: true, booking: created });
  } catch (err: any) {
    console.error("[/api/bookings] POST error:", err?.message, err?.stack);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
