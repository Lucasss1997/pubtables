// src/app/api/sessions/end/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
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
    const { sessionId, slug, tableId, endAt } = body as {
      sessionId?: string;
      slug?: string;
      tableId?: string;
      endAt?: string;
    };

    if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (!tableId) return NextResponse.json({ error: "Missing tableId" }, { status: 400 });

    const end = endAt ? new Date(endAt) : new Date();
    if (isNaN(+end)) return NextResponse.json({ error: "Invalid endAt" }, { status: 400 });

    const pub = await prisma.pub.findFirst({ where: { slug }, select: { id: true } });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    const ok = await verifyHostPinForPub(req, pub.id);
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sess = await prisma.session.findFirst({
      where: { id: sessionId, pubId: pub.id, tableId },
      select: { id: true, startedAt: true, endsAt: true, status: true },
    });
    if (!sess) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: {
        endsAt: end,
        // If your schema uses an enum, replace with the correct value, e.g. "ended"
        status: ("ended" as any),
      },
      select: { id: true, tableId: true, startedAt: true, endsAt: true, status: true },
    });

    return NextResponse.json({ ok: true, session: updated });
  } catch (err: any) {
    console.error("[/api/sessions/end] POST error:", err?.message, err?.stack);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
