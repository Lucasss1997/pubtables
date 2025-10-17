import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sessionId, status } = body as { sessionId?: string; status?: string };
    if (!sessionId || !status) return NextResponse.json({ error: "Missing sessionId/status" }, { status: 400 });

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: { status: status as any },
      select: { id: true, status: true },
    });

    return NextResponse.json({ ok: true, session: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
