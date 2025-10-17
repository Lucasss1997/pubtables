// src/app/api/bookings/status/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import bcrypt from "bcryptjs";

type BookingStatus = "ACTIVE" | "ARRIVED" | "NO_SHOW" | "CANCELLED" | "COMPLETED";

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
    // If auth table is missing in some envs, allow to prevent hard-lock during dev
    return ALLOW_IF_NO_AUTH;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { bookingId, slug, status } = body as {
      bookingId?: string;
      slug?: string;
      status?: BookingStatus;
    };

    if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (!status) return NextResponse.json({ error: "Missing status" }, { status: 400 });

    const pub = await prisma.pub.findFirst({
      where: { slug },
      select: { id: true },
    });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    const ok = await verifyHostPinForPub(req, pub.id);
    if (!ok) return NextResponse.json({ error: "Unauthorized (PIN invalid)" }, { status: 401 });

    const existing = await prisma.booking.findFirst({
      where: { id: bookingId, pubId: pub.id },
      select: { id: true, status: true },
    });
    if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    // update regardless of date; only change the status
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[/api/bookings/status] POST error:", err?.message, err?.stack);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
