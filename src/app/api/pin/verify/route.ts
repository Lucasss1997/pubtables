export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import bcrypt from "bcryptjs";

const hits = new Map<string, { c: number; t: number }>();
function limited(key: string, limit = 8, windowMs = 60_000) {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now - rec.t > windowMs) {
    hits.set(key, { c: 1, t: now });
    return false;
  }
  rec.c++;
  return rec.c > limit;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Body = { slug?: string; pin?: string | number };

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(`pin:${ip}`)) {
    return NextResponse.json({ ok: false, reason: "Try again shortly." }, { status: 429 });
  }

  let payload: Body;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "Invalid request." }, { status: 400 });
  }

  const slug = String(payload.slug ?? "").trim().toLowerCase();
  const pinStr = String(payload.pin ?? "").trim();
  if (!slug || !/^\d{6}$/.test(pinStr)) {
    return NextResponse.json({ ok: false, reason: "Invalid credentials." }, { status: 200 });
  }

  try {
    const pub = await prisma.pub.findUnique({
      where: { slug },
      select: { id: true, adminPinHash: true },
    });

    // ✅ Proper null guard to satisfy TS (“pub is possibly null”)
    if (!pub || !pub.adminPinHash) {
      await sleep(120); // reduce timing signal
      return NextResponse.json({ ok: false, reason: "Invalid credentials." }, { status: 200 });
    }

    const ok = await bcrypt.compare(pinStr, pub.adminPinHash);
    if (!ok) {
      return NextResponse.json({ ok: false, reason: "Invalid credentials." }, { status: 200 });
    }

    return NextResponse.json({ ok: true, pubId: pub.id }, { status: 200 });
  } catch (err) {
    console.error("[PIN_VERIFY]", err);
    return NextResponse.json({ ok: false, reason: "Server error." }, { status: 500 });
  }
}
