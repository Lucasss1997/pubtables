// src/app/api/schedule/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import bcrypt from "bcryptjs";

/**
 * Verify host PIN for a pubId using a separate auth model if present.
 * If no auth record exists, we assume "no PIN configured" and allow.
 *
 * Adjust MODEL NAME below if your table isn't called `hostAuth`.
 */
async function verifyHostPinForPub(pubId: string, pin: string): Promise<boolean> {
  // Require 6-digit format when a PIN is supplied
  if (!pin || !/^\d{6}$/.test(pin)) return false;

  // Try a dedicated auth table keyed by pubId (rename if needed)
  try {
    const auth = await (prisma as any).hostAuth?.findFirst?.({
      where: { pubId },
      select: { pin: true, pinHash: true },
    });

    if (auth?.pinHash) {
      return await bcrypt.compare(pin, auth.pinHash);
    }
    if (auth?.pin) {
      return auth.pin === pin;
    }

    // No auth record for this pub → treat as "no PIN configured"
    // If you want to enforce a PIN, remove the line below and return false instead.
    return true;
  } catch {
    // If the model doesn't exist in your schema, also allow (no PIN configured)
    return true;
  }
}

function dayWindow(dateStr?: string) {
  const base = dateStr
    ? new Date(`${dateStr}T00:00:00.000Z`)
    : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");

  if (isNaN(base.getTime())) {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  const start = new Date(base);
  const end = new Date(base);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug") || undefined;
    const tableId = searchParams.get("tableId") || undefined;
    const date = searchParams.get("date") || undefined;

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (!tableId) return NextResponse.json({ error: "Missing tableId" }, { status: 400 });

    // Find pub by slug (DO NOT select pin/pinHash here—those fields don't exist)
    const pub = await prisma.pub.findFirst({
      where: { slug },
      select: { id: true, name: true, slug: true },
    });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    // Verify PIN from header (against hostAuth, or allow if none configured)
    const pin = (req.headers.get("x-host-pin") || "").trim();
    const ok = await verifyHostPinForPub(pub.id, pin);
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { start, end } = dayWindow(date);

    // Ensure table belongs to pub (safety)
    const table = await prisma.table.findFirst({
      where: { id: tableId, pubId: pub.id, active: true },
      select: { id: true },
    });
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    // Bookings overlapping the window
    const bookings = await prisma.booking.findMany({
      where: {
        pubId: pub.id,
        tableId: tableId,
        startAt: { lt: end },
        endAt: { gt: start },
      },
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        tableId: true,
        startAt: true,
        endAt: true,
        partyName: true,
        notes: true,
      },
    });

    // Sessions overlapping the window
    const sessions = await prisma.session.findMany({
      where: {
        pubId: pub.id,
        tableId: tableId,
        startedAt: { lt: end },
        endsAt: { gt: start },
      },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        tableId: true,
        startedAt: true,
        endsAt: true,
        status: true,
      },
    });

    // Normalize items (matches your client expectations)
    const items = [
      ...bookings.map((b) => ({
        id: b.id,
        tableId: b.tableId,
        startAt: b.startAt.toISOString(),
        endAt: b.endAt.toISOString(),
        partyName: b.partyName ?? null,
        notes: b.notes ?? null,
        type: "booking" as const,
      })),
      ...sessions.map((s) => ({
        id: s.id,
        tableId: s.tableId,
        startAt: s.startedAt.toISOString(),
        endAt: s.endsAt.toISOString(),
        partyName: s.status === "active" ? "Walk-in" : s.status,
        status: s.status,
        type: "session" as const,
      })),
    ].sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));

    return NextResponse.json({
      pub: { id: pub.id, name: pub.name, slug: pub.slug },
      tableId,
      date: date ?? start.toISOString().slice(0, 10),
      window: { start: start.toISOString(), end: end.toISOString() },
      items,
      stats: { totalItems: items.length, bookings: bookings.length, sessions: sessions.length },
    });
  } catch (err: any) {
    console.error("[/api/schedule] error:", err?.message, err?.stack);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
