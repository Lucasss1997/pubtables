import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sessionId } = body as { sessionId?: string };
    if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

    const stopped = await prisma.session.update({
      where: { id: sessionId },
      data: { status: "ended" as any, endsAt: new Date() },
      select: { id: true, status: true, endsAt: true },
    });

    return NextResponse.json({ ok: true, session: stopped });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
