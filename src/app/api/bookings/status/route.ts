// src/app/api/bookings/status/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { BookingStatus } from "@prisma/client";

// Request body from the client
type Body = {
  slug?: string;
  bookingId?: string;
  status?: keyof typeof BookingStatus; // "ACTIVE" | "ARRIVED" | "NO_SHOW" | "CANCELLED" | "COMPLETED"
};

export async function POST(req: Request) {
  try {
    // Simple header check — keep whatever auth you already have
    const pin = req.headers.get("x-host-pin") || req.headers.get("X-Host-Pin");
    if (!pin) {
      return NextResponse.json({ error: "Missing host PIN" }, { status: 401 });
    }

    const { slug, bookingId, status } = (await req.json()) as Body;
    if (!slug || !bookingId || !status) {
      return NextResponse.json({ error: "Missing slug, bookingId or status" }, { status: 400 });
    }

    // Validate against the enum your client actually exports
    const allowed = new Set(Object.keys(BookingStatus)); // keys: "ACTIVE" | "ARRIVED" | ...
    if (!allowed.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const newStatus = BookingStatus[status]; // turn key into enum value

    // Confirm pub exists
    const pub = await prisma.pub.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!pub) {
      return NextResponse.json({ error: "Pub not found" }, { status: 404 });
    }

    // Confirm booking belongs to this pub
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, pubId: true },
    });
    if (!booking || booking.pubId !== pub.id) {
      return NextResponse.json({ error: "Booking not found for this pub" }, { status: 404 });
    }

    // Build update payload
    const data: Parameters<typeof prisma.booking.update>[0]["data"] = {
      status: newStatus,
    };

    const now = new Date();
    if (newStatus === BookingStatus.ARRIVED) {
      data.arrivedAt = now;
    } else if (newStatus === BookingStatus.NO_SHOW) {
      data.noShowAt = now;
    } else if (newStatus === BookingStatus.CANCELLED) {
      data.cancelledAt = now;
    }
    // COMPLETED: no timestamp by default. Add completedAt to schema later if you want.

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data,
      select: { id: true, status: true },
    });

    return NextResponse.json({ ok: true, bookingId: updated.id, status: updated.status });
  } catch (err) {
    console.error("[BOOKINGS_STATUS]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
