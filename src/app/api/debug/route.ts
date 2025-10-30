// app/api/debug/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const pubs = await prisma.pub.findMany({
      take: 5,
      select: { id: true, slug: true, name: true },
    });

    const tables = await prisma.table.findMany({
      take: 10,
      select: { id: true, pubId: true, label: true, pinHash: true },
      where: { pinHash: { not: null } } as any, // ← Fix TS error
    });

    const bookings = await prisma.booking.findMany({
      take: 5,
      include: { table: true },
    });

    return NextResponse.json(
      {
        debug: "PubTables Debug",
        pubs,
        tables: tables.map(t => ({
          ...t,
          pinHash: t.pinHash ? "[HIDDEN]" : null,
        })),
        bookings,
      },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: "Debug failed", message: error.message },
      { status: 500 }
    );
  }
}