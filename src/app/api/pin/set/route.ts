export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import bcrypt from "bcryptjs";

type Body = { slug?: string; newPin?: string | number };

function bad(reason: string, status = 400) {
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function POST(req: Request) {
  try {
    const { slug, newPin } = (await req.json()) as Body;
    const s = String(slug ?? "").trim().toLowerCase();
    const pin = String(newPin ?? "").trim();
    if (!s || !/^\d{6}$/.test(pin)) return bad("Invalid request.");

    // Find the pub minimally
    const pub = await prisma.pub.findUnique({
      where: { slug: s },
      select: { id: true },
    });

    // ✅ Guard null before using pub.id
    if (!pub) return bad("Invalid request.", 200);

    const hash = await bcrypt.hash(pin, 10);

    await prisma.pub.update({
      where: { id: pub.id },
      data: { adminPinHash: hash },
    });

    return NextResponse.json({ ok: true, pubId: pub.id, slug: s }, { status: 200 });
  } catch (err) {
    console.error("[PIN_SET]", err);
    return bad("Server error.", 500);
  }
}
