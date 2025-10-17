export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { slug, bookingId, status } = body as {
      slug?: string;
      bookingId?: string;
      status?: "ARRIVED" | "NO_SHOW" | "COMPLETED" | "CANCELLED";
    };

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
    if (!status) return NextResponse.json({ error: "Missing status" }, { status: 400 });

    const pub = await prisma.pub.findFirst({ where: { slug }, select: { id: true } });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    const existing = await prisma.booking.findFirst({
      where: { id: bookingId, pubId: pub.id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    const stamp: any = {};
    if (status === "ARRIVED") stamp.arrivedAt = new Date();
    if (status === "NO_SHOW") stamp.noShowAt = new Date();
    if (status === "CANCELLED") stamp.cancelledAt = new Date();

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status, ...stamp },
      select: { id: true, status: true, arrivedAt: true, noShowAt: true, cancelledAt: true },
    });

    return NextResponse.json({ ok: true, booking: updated });
  } catch (err: any) {
    console.error("[/api/bookings/status] POST error:", err?.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
