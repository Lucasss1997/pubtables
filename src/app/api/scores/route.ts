export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { slug, tableId, playerName, points } = body as {
      slug?: string;
      tableId?: string | null;
      playerName?: string | null;
      points?: number;
    };

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (typeof points !== "number") return NextResponse.json({ error: "Missing points" }, { status: 400 });

    const pub = await prisma.pub.findFirst({ where: { slug }, select: { id: true } });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    let tId: string | null = null;
    if (tableId) {
      const t = await prisma.table.findFirst({
        where: { id: tableId, pubId: pub.id },
        select: { id: true },
      });
      if (!t) return NextResponse.json({ error: "Table not found" }, { status: 404 });
      tId = t.id;
    }

    const created = await prisma.score.create({
      data: {
        pubId: pub.id,
        tableId: tId,
        playerName: playerName ?? null,
        points,
      },
      select: { id: true, tableId: true, playerName: true, points: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, score: created });
  } catch (err: any) {
    console.error("[/api/scores] POST error:", err?.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
