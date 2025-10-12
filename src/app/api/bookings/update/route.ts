// src/app/api/bookings/update/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
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
    const { bookingId, slug, tableId, startAt, endAt, partyName, notes } = body as {
      bookingId?: string;
      slug?: string;
      tableId?: string;
      startAt?: string;
      endAt?: string;
      partyName?: string | null;
      notes?: string | null;
    };

    if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (!tableId) return NextResponse.json({ error: "Missing tableId" }, { status: 400 });
    if (!startAt || !endAt) return NextResponse.json({ error: "Missing startAt/endAt" }, { status: 400 });

    const s = new Date(startAt);
    const e = new Date(endAt);
    if (isNaN(+s)) return NextResponse.json({ error: "Invalid startAt" }, { status: 400 });
    if (isNaN(+e)) return NextResponse.json({ error: "Invalid endAt" }, { status: 400 });
    if (e <= s) return NextResponse.json({ error: "endAt must be after startAt" }, { status: 400 });

    const now = new Date();
    if (s < now) return NextResponse.json({ error: "Start time must be in the future" }, { status: 400 });

    const pub = await prisma.pub.findFirst({ where: { slug }, select: { id: true } });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    const ok = await verifyHostPinForPub(req, pub.id);
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Booking must belong to this pub + table
    const existing = await prisma.booking.findFirst({
      where: { id: bookingId, pubId: pub.id, tableId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    // Overlap: other bookings (exclude self)
    const overlappingBooking = await prisma.booking.findFirst({
      where: {
        pubId: pub.id,
        tableId,
        id: { not: bookingId },
        startAt: { lt: e },
        endAt: { gt: s },
      },
      select: { id: true },
    });
    if (overlappingBooking) return NextResponse.json({ error: "Overlaps another booking" }, { status: 409 });

    // Overlap: sessions
    const overlappingSession = await prisma.session.findFirst({
      where: {
        pubId: pub.id,
        tableId,
        startedAt: { lt: e },
        endsAt: { gt: s },
      },
      select: { id: true },
    });
    if (overlappingSession) return NextResponse.json({ error: "Overlaps a session" }, { status: 409 });

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        startAt: s,
        endAt: e,
        partyName: partyName ?? null,
        notes: notes ?? null,
      },
      select: { id: true, tableId: true, startAt: true, endAt: true, partyName: true, notes: true },
    });

    return NextResponse.json({ ok: true, booking: updated });
  } catch (err: any) {
    console.error("[/api/bookings/update] POST error:", err?.message, err?.stack);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
