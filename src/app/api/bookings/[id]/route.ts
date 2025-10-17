// src/app/api/bookings/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
// If you don't have "@/lib/prisma" alias, change this to: "../../../lib/prisma"
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const ALLOW_IF_NO_AUTH = true;

async function verifyHostPinForPub(req: NextRequest, pubId: string): Promise<boolean> {
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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const bookingId = params.id;
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug") || "";

    if (!bookingId) return NextResponse.json({ error: "Missing booking id" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const pub = await prisma.pub.findFirst({ where: { slug }, select: { id: true } });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    const ok = await verifyHostPinForPub(req, pub.id);
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const existing = await prisma.booking.findFirst({
      where: { id: bookingId, pubId: pub.id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    await prisma.booking.delete({ where: { id: bookingId } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[/api/bookings/[id]] DELETE error:", err?.message, err?.stack);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
