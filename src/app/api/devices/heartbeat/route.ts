export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { slug, deviceId, batteryPct } = body as {
      slug?: string;
      deviceId?: string;
      batteryPct?: number | null;
    };

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (!deviceId) return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });

    const pub = await prisma.pub.findFirst({ where: { slug }, select: { id: true } });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    const updated = await prisma.device.updateMany({
      where: { deviceId, pubId: pub.id },
      data: { lastSeenAt: new Date(), batteryPct: batteryPct ?? undefined },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[/api/devices/heartbeat] POST error:", err?.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
