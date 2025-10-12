import { db } from "@/lib/db"; // or: import { db } from "../../../lib/db";

export async function GET() {
  try {
    // Simple Prisma read (no raw SQL)
    const pubs = await db.pub.findMany({ take: 1 });
    return new Response(
      JSON.stringify({ ok: true, prisma: true, pubs: pubs.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("pingdb error:", e);
    return new Response(
      JSON.stringify({
        ok: false,
        prisma: false,
        message: e?.message,
        code: e?.code,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
