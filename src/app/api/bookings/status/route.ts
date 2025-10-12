// Force Node runtime so Prisma works
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "../../../../lib/prisma";

/**
 * Verify host PIN against any active table's pinHash in this pub.
 * Succeeds if the provided 6-digit PIN matches ANY table hash for the pub.
 */
async function verifyHostPinForPub(req: Request, pubId: string): Promise<boolean> {
  try {
    const pin = (req.headers.get("x-host-pin") || "").trim();
    if (!/^\d{6}$/.test(pin)) return false;

    const rows = await prisma.table.findMany({
      where: { pubId, active: true },
      select: { pinHash: true },
    });

    for (const row of rows) {
      if (row.pinHash && (await bcrypt.compare(pin, row.pinHash))) {
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error("[bookings/status] PIN verify error:", e);
    return false;
  }
}

/**
 * POST /api/bookings/status
 * Body: { slug: string, bookingId: string, status: "ARRIVED" | "NO_SHOW" | "CANCELLED" }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { slug, bookingId, status } = body as {
      slug?: string;
      bookingId?: string;
      status?: "ARRIVED" | "NO_SHOW" | "CANCELLED";
    };

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
    if (!status || !["ARRIVED", "NO_SHOW", "CANCELLED"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const pub = await prisma.pub.findFirst({
      where: { slug },
      select: { id: true },
    });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    const ok = await verifyHostPinForPub(req, pub.id);
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Ensure booking belongs to this pub
    const b = await prisma.booking.findFirst({
      where: { id: bookingId, pubId: pub.id },
      select: { id: true },
    });
    if (!b) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    const now = new Date();
    const data: any = { status };
    if (status === "ARRIVED") data.arrivedAt = now;
    if (status === "NO_SHOW") data.noShowAt = now;
    if (status === "CANCELLED") data.cancelledAt = now;

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data,
      select: {
        id: true,
        status: true,
        arrivedAt: true,
        noShowAt: true,
        cancelledAt: true,
      },
    });

    return NextResponse.json({ ok: true, booking: updated });
  } catch (err: any) {
    console.error("[/api/bookings/status] error:", err?.message, err?.stack);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
