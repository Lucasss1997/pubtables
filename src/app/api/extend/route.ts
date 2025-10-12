import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { sessionId, minutes } = await req.json();
    if (!sessionId)
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

    const session = await db.session.findUnique({ where: { id: sessionId } });
    if (!session)
      return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const newEndsAt = new Date(session.endsAt.getTime() + (minutes ?? 30) * 60 * 1000);

    await db.session.update({
      where: { id: sessionId },
      data: { endsAt: newEndsAt },
    });

    return NextResponse.json({ ok: true, newEndsAt });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
