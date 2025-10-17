export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug") || undefined;
    const tableId = searchParams.get("tableId") || undefined;
    const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") || 10)));

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const pub = await prisma.pub.findFirst({ where: { slug }, select: { id: true } });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    const where: any = { pubId: pub.id };
    if (tableId) where.tableId = tableId;

    const rows = await prisma.score.findMany({
      where,
      orderBy: [{ points: "desc" }, { createdAt: "asc" }],
      take: limit,
      select: { id: true, tableId: true, playerName: true, points: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, leaderboard: rows });
  } catch (err: any) {
    console.error("[/api/leaderboard] GET error:", err?.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
