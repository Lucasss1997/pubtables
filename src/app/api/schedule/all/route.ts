// Force Node runtime so Prisma works
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma"; // Use named import for consistency

function dayWindow(dateStr?: string) {
  try {
    const base = dateStr
      ? new Date(`${dateStr}T00:00:00.000Z`)
      : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");

    // Validate the date is valid
    if (isNaN(base.getTime())) {
      throw new Error("Invalid date");
    }

    const start = new Date(base);
    const end = new Date(base);
    end.setUTCDate(end.getUTCDate() + 1);

    return { start, end };
  } catch (error) {
    console.error("Date parsing error:", error);
    // Return today's window as fallback
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
}

export async function GET(req: Request) {
  try {
    console.log("[DEBUG] Request received:", req.url);

    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    const date = searchParams.get("date") ?? undefined;

    console.log("[DEBUG] Params:", { slug, date });

    if (!slug) {
      return NextResponse.json({ error: "Missing slug parameter" }, { status: 400 });
    }

    console.log("[DEBUG] Calling dayWindow...");
    const { start, end } = dayWindow(date);
    console.log("[DEBUG] Day window:", { start: start.toISOString(), end: end.toISOString() });

    // Find pub/venue by slug
    console.log("[DEBUG] Querying pub with slug:", slug);
    const pub = await prisma.pub.findFirst({
      where: { slug },
      select: { id: true, name: true, slug: true },
    });
    console.log("[DEBUG] Pub found:", pub);

    if (!pub) {
      return NextResponse.json({ error: "Pub not found" }, { status: 404 });
    }

    // Get all active tables for this pub
    console.log("[DEBUG] Querying tables for pubId:", pub.id);
    const tables = await prisma.table.findMany({
      where: {
        pubId: pub.id,
        active: true,
      },
      orderBy: { label: "asc" },
      select: {
        id: true,
        label: true,
      },
    });
    console.log("[DEBUG] Tables found:", tables.length);

    // Get bookings overlapping the day window
    console.log("[DEBUG] Querying bookings...");
    const bookings = await prisma.booking.findMany({
      where: {
        pubId: pub.id,
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
        // NEW: include persisted status so UI can show ARRIVED / NO_SHOW / CANCELLED immediately
        status: true,
      },
    });
    console.log("[DEBUG] Bookings found:", bookings.length);

    // Get sessions overlapping the day window
    console.log("[DEBUG] Querying sessions...");
    const sessions = await prisma.session.findMany({
      where: {
        pubId: pub.id,
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
    console.log("[DEBUG] Sessions found:", sessions.length);

    // Combine bookings and sessions into a unified format
    const items = [
      ...bookings.map((b) => ({
        id: b.id,
        tableId: b.tableId,
        startAt: b.startAt.toISOString(),
        endAt: b.endAt.toISOString(),
        partyName: b.partyName ?? null,
        notes: b.notes ?? null,
        status: b.status ?? undefined, // pass through persisted status
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
    ].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

    return NextResponse.json({
      pub: {
        id: pub.id,
        name: pub.name,
        slug: pub.slug,
      },
      date: date ?? start.toISOString().slice(0, 10),
      window: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      tables,
      items,
      stats: {
        totalTables: tables.length,
        totalBookings: bookings.length,
        totalSessions: sessions.length,
      },
    });
  } catch (err: unknown) {
    console.error("[/api/schedule/all] error:");
    if (err instanceof Error) {
      console.error("Message:", err.message);
      console.error("Stack:", err.stack);
    } else {
      console.error("Unknown error:", err);
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
