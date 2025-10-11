import { pool } from "@/lib/db";

export async function GET() {
  try {
    const r = await pool.query("select now()");
    return new Response(JSON.stringify({ db_time: r.rows[0].now as string }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { "content-type": "application/json" },
      status: 500,
    });
  }
}
