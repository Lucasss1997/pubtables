export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "crypto";
import { pool, j, bad, ensureDefaultVenue } from "@/lib";

type Body = {
  device_code: string;
  table_label?: string;
  venue_id?: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  if (!body.device_code) return bad("Missing device_code");

  const venue_id = body.venue_id || (await ensureDefaultVenue(pool));

  const result = await pool.query(
    `insert into devices (device_code, table_label, api_key, venue_id)
     values ($1, $2, $3, $4)
     on conflict (device_code) do update
     set table_label = excluded.table_label
     returning id, api_key`,
    [body.device_code, body.table_label, randomUUID(), venue_id]
  );

  return j(result.rows[0]);
}
