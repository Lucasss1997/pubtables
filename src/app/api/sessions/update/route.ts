// src/app/api/sessions/update/route.ts
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
    const { sessionId, slug, tableId, startAt, endAt } = body as {
      sessionId?: string;
      slug?: string;
      tableId?: string;
      startAt?: string;
      endAt?: string;
    };

    if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (!tableId) return NextResponse.json({ error: "Missing tableId" }, { status: 400 });
    if (!startAt || !endAt) return NextResponse.json({ error: "Missing startAt/endAt" }, { status: 400 });

    const s = new Date(startAt);
    const e = new Date(endAt);
    if (isNaN(+s)) return NextResponse.json({ error: "Invalid startAt" }, { status: 400 });
    if (isNaN(+e)) return NextResponse.json({ error: "Invalid endAt" }, { status: 400 });
    if (e <= s) return NextResponse.json({ error: "endAt must be after startAt" }, { status: 400 });

    // Guard: cannot move into the past
    const now = new Date();
    if (s < now) return NextResponse.json({ error: "Start time must be in the future" }, { status: 400 });

    // Pub & auth
    const pub = await prisma.pub.findFirst({ where: { slug }, select: { id: true } });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    const ok = await verifyHostPinForPub(req, pub.id);
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Session must belong to this pub & table
    const sess = await prisma.session.findFirst({
      where: { id: sessionId, pubId: pub.id, tableId },
      select: { id: true },
    });
    if (!sess) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    // Overlap check against bookings
    const overlappingBooking = await prisma.booking.findFirst({
      where: {
        pubId: pub.id,
        tableId,
        startAt: { lt: e },
        endAt: { gt: s },
      },
      select: { id: true },
    });
    if (overlappingBooking) return NextResponse.json({ error: "Overlaps an existing booking" }, { status: 409 });

    // Overlap check against other sessions (exclude this one)
    const overlappingSession = await prisma.session.findFirst({
      where: {
        pubId: pub.id,
        tableId,
        id: { not: sessionId },
        startedAt: { lt: e },
        endsAt: { gt: s },
      },
      select: { id: true },
    });
    if (overlappingSession) return NextResponse.json({ error: "Overlaps another session" }, { status: 409 });

    // Update session times
    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: { startedAt: s, endsAt: e },
      select: { id: true, tableId: true, startedAt: true, endsAt: true, status: true },
    });

    return NextResponse.json({ ok: true, session: updated });
  } catch (err: any) {
    console.error("[/api/sessions/update] POST error:", err?.message, err?.stack);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
