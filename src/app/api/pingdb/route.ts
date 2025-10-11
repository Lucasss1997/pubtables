// src/app/api/pingdb/route.ts
import { pool } from "../../../lib/db";

export async function GET() {
  try {
    const r = await pool.query("select now()");
    return new Response(JSON.stringify({ db_time: r.rows[0].now }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      headers: { "content-type": "application/json" },
      status: 500,
    });
  }
}
