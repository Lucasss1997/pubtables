// src/app/api/pingdb/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // ← was { db } before

export async function GET() {
  try {
    // Simple round-trip check
    const rows = await prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() AS now`;
    return NextResponse.json({ ok: true, now: rows?.[0]?.now ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "DB error" }, { status: 500 });
  }
}
