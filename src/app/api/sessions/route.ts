export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import bcrypt from "bcryptjs";

const ALLOW_IF_NO_AUTH = true;

async function verifyHostPinForPub(req: Request, pubId: string): Promise<boolean> {
  const pin = (req.headers.get("x-host-pin") || "").trim();
  if (!/^\d{6}$/.test(pin)) return false;

  try {
    const auth = await (prisma as any).hostAuth?.findFirst?.({
      where: { pubId },
      select: { pin: true, pinHash: true },
    });
    if (!auth) return ALLOW_IF_NO_AUTH;
    if (auth.pinHash) return await bcrypt.compare(pin, auth.pinHash);
    if (auth.pin) return auth.pin === pin;
    return ALLOW_IF_NO_AUTH;
  } catch {
    return ALLOW_IF_NO_AUTH;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { slug, tableId, startAt, endAt } = body as {
      slug?: string; tableId?: string; startAt?: string; endAt?: string;
    };

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (!tableId) return NextResponse.json({ error: "Missing tableId" }, { status: 400 });
    if (!startAt || !endAt) return NextResponse.json({ error: "Missing startAt/endAt" }, { status: 400 });

    const start = new Date(startAt);
    const end = new Date(endAt);
    if (isNaN(+start)) return NextResponse.json({ error: "Invalid startAt" }, { status: 400 });
    if (isNaN(+end)) return NextResponse.json({ error: "Invalid endAt" }, { status: 400 });
    if (end <= start) return NextResponse.json({ error: "endAt must be after startAt" }, { status: 400 });

    const pub = await prisma.pub.findFirst({ where: { slug }, select: { id: true, slug: true } });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    const ok = await verifyHostPinForPub(req, pub.id);
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const table = await prisma.table.findFirst({
      where: { id: tableId, pubId: pub.id, active: true }, select: { id: true }
    });
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    // REQUIRED: status must be provided (enum likely includes "active")
    const created = await prisma.session.create({
      data: {
        pubId: pub.id,
        tableId,
        startedAt: start,
        endsAt: end,
        status: "active", // <-- required
      },
      select: { id: true, tableId: true, startedAt: true, endsAt: true, status: true },
    });

    return NextResponse.json({ ok: true, session: created });
  } catch (err: any) {
    console.error("[/api/sessions] POST error:", err?.message, err?.stack);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
