import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const todayStart = new Date(new Date().toDateString());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const [pubs, tables, activeSessions, todayBookings] = await prisma.$transaction([
      prisma.pub.count(),
      prisma.table.count({ where: { active: true } }),
      prisma.session.count({ where: { status: "active" as any } }),
      prisma.booking.count({
        where: { startAt: { gte: todayStart, lt: tomorrowStart } },
      }),
    ]);

    return NextResponse.json({ pubs, tables, activeSessions, todayBookings });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
