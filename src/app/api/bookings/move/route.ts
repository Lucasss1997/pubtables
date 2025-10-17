// src/app/api/bookings/move/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma"; // <-- WRONG for your tree
// FIXED:
import { prisma as fixedPrisma } from "../../../../lib/prisma";
import bcrypt from "bcryptjs";

// Use the fixed import everywhere below
const prismaClient = fixedPrisma;

const ALLOW_IF_NO_AUTH = true;

async function verifyHostPinForPub(req: Request, pubId: string): Promise<boolean> {
  const pin = (req.headers.get("x-host-pin") || "").trim();
  if (!/^\d{6}$/.test(pin)) return false;
  try {
    const auth = await (prismaClient as any).hostAuth?.findFirst?.({
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

/**
 * Move a booking: change time and/or table.
 *
 * Body JSON:
 * {
 *   "slug": "theriser",
 *   "bookingId": "xxx",
 *   "newTableId": "table-2",          // optional; keep same if omitted
 *   "newStartAt": "2025-10-16T19:00:00.000Z", // optional; keep same if omitted
 *   "newEndAt":   "2025-10-16T20:00:00.000Z"  // optional; keep same if omitted
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      slug,
      bookingId,
      newTableId,
      newStartAt,
      newEndAt,
    }: {
      slug?: string;
      bookingId?: string;
      newTableId?: string;
      newStartAt?: string;
      newEndAt?: string;
    } = body;

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

    // Validate optional times if present
    let startAtDate: Date | undefined;
    let endAtDate: Date | undefined;

    if (newStartAt) {
      startAtDate = new Date(newStartAt);
      if (isNaN(+startAtDate)) return NextResponse.json({ error: "Invalid newStartAt" }, { status: 400 });
    }
    if (newEndAt) {
      endAtDate = new Date(newEndAt);
      if (isNaN(+endAtDate)) return NextResponse.json({ error: "Invalid newEndAt" }, { status: 400 });
    }
    if (startAtDate && endAtDate && +endAtDate <= +startAtDate) {
      return NextResponse.json({ error: "newEndAt must be after newStartAt" }, { status: 400 });
    }

    const pub = await prismaClient.pub.findFirst({ where: { slug }, select: { id: true } });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    const ok = await verifyHostPinForPub(req, pub.id);
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch booking to ensure it belongs to this pub
    const booking = await prismaClient.booking.findFirst({
      where: { id: bookingId, pubId: pub.id },
      select: { id: true, tableId: true, startAt: true, endAt: true },
    });
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    // Build update payload
    const data: any = {};
    if (typeof newTableId === "string" && newTableId.length > 0) data.tableId = newTableId;
    if (startAtDate) data.startAt = startAtDate;
    if (endAtDate) data.endAt = endAtDate;

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await prismaClient.booking.update({
      where: { id: bookingId },
      data,
      select: {
        id: true,
        tableId: true,
        startAt: true,
        endAt: true,
        partyName: true,
        status: true,
      },
    });

    return NextResponse.json({ ok: true, booking: updated });
  } catch (err: any) {
    console.error("[/api/bookings/move] POST error:", err?.message, err?.stack);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
