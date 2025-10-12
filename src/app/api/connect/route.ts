import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { compare } from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { slug, pin } = await req.json(); // pub slug + 6-digit pin

    if (!slug || !pin)
      return NextResponse.json({ error: "Missing slug or pin" }, { status: 400 });

    const pub = await db.pub.findUnique({ where: { slug } });
    if (!pub) return NextResponse.json({ error: "Pub not found" }, { status: 404 });

    const tables = await db.table.findMany({ where: { pubId: pub.id, active: true } });

    for (const table of tables) {
      const ok = await compare(pin, table.pinHash);
      if (ok) {
        const now = new Date();
        const endsAt = new Date(now.getTime() + 45 * 60 * 1000); // 45 min session

        const session = await db.session.create({
          data: { pubId: pub.id, tableId: table.id, status: "active", startedAt: now, endsAt },
        });

        return NextResponse.json({ ok: true, sessionId: session.id, endsAt });
      }
    }

    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
