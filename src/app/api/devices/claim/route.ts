export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { slug, deviceId, tableId } = body as {
      slug?: string;
      deviceId?: string;
      tableId?: string | null;
    };

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (!deviceId) return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });

    const pub = await prisma.pub.findFirst({ where: { slug }, select: { id: true } });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    let tId: string | null = null;
    if (tableId) {
      const t = await prisma.table.findFirst({
        where: { id: tableId, pubId: pub.id, active: true },
        select: { id: true },
      });
      if (!t) return NextResponse.json({ error: "Table not found" }, { status: 404 });
      tId = t.id;
    }

    const upserted = await prisma.device.upsert({
      where: { deviceId },
      update: { pubId: pub.id, tableId: tId ?? null, status: "active", claimedAt: new Date(), lastSeenAt: new Date() },
      create: { deviceId, pubId: pub.id, tableId: tId ?? null, status: "active", claimedAt: new Date(), lastSeenAt: new Date() },
      select: { id: true, deviceId: true, tableId: true, lastSeenAt: true, status: true },
    });

    return NextResponse.json({ ok: true, device: upserted });
  } catch (err: any) {
    console.error("[/api/devices/claim] POST error:", err?.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
