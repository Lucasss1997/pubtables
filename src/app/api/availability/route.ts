import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const MAX_UNBOOKED_MIN = 120; // fallback cap if no upcoming booking

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");        // e.g. theriser
    const tableId = searchParams.get("tableId");  // e.g. seed-table-1
    const startIso = searchParams.get("start");   // ISO time to start from

    if (!slug || !tableId || !startIso) {
      return NextResponse.json({ error: "Missing slug, tableId, or start" }, { status: 400 });
    }

    const startAt = new Date(startIso);
    if (isNaN(startAt.getTime())) {
      return NextResponse.json({ error: "Bad start datetime" }, { status: 400 });
    }

    const pub = await db.pub.findUnique({ where: { slug } });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    const table = await db.table.findFirst({ where: { id: tableId, pubId: pub.id, active: true } });
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    const next = await db.booking.findFirst({
      where: { tableId: table.id, startAt: { gt: startAt } },
      orderBy: { startAt: "asc" }
    });

    let availableMinutes = MAX_UNBOOKED_MIN;
    let nextBookingAt: string | null = null;

    if (next) {
      nextBookingAt = next.startAt.toISOString();
      const gapMs = next.startAt.getTime() - startAt.getTime();
      availableMinutes = Math.max(0, Math.ceil(gapMs / 60000));
    }

    return NextResponse.json({ availableMinutes, nextBookingAt });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
