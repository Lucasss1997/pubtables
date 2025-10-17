export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { slug, tableId, endsAt } = body as {
      slug?: string;
      tableId?: string;
      endsAt?: string; // ISO
    };

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (!tableId) return NextResponse.json({ error: "Missing tableId" }, { status: 400 });

    const pub = await prisma.pub.findFirst({ where: { slug }, select: { id: true } });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    const table = await prisma.table.findFirst({
      where: { id: tableId, pubId: pub.id, active: true },
      select: { id: true },
    });
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    const end = endsAt ? new Date(endsAt) : new Date(Date.now() + 60 * 60 * 1000);
    if (isNaN(+end)) return NextResponse.json({ error: "Invalid endsAt" }, { status: 400 });

    const created = await prisma.session.create({
      data: {
        pubId: pub.id,
        tableId: table.id,
        status: "active",
        endsAt: end,
      },
      select: { id: true, tableId: true, startedAt: true, endsAt: true, status: true },
    });

    return NextResponse.json({ ok: true, session: created });
  } catch (err: any) {
    console.error("[/api/admin/session/start] POST error:", err?.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
