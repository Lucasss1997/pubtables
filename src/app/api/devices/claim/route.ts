export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "crypto";
import { pool } from "@/lib/db";
import { j, bad } from "@/lib/resp";
import { ensureDefaultVenue } from "@/lib/auth";

type Body = { device_code: string; table_label?: string; venue_id?: string };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !body.device_code) return bad("device_code is required");

  const venueId = body.venue_id || (await ensureDefaultVenue(pool));

  const existing = await pool.query<{
    id: string; api_key: string; table_label: string | null;
  }>(
    "select id, api_key, table_label from devices where device_code = $1",
    [body.device_code]
  );

  if (existing.rowCount > 0) {
    return j({
      device_id: existing.rows[0].id,
      api_key: existing.rows[0].api_key,
      table_label: existing.rows[0].table_label ?? "Table",
      venue_id: venueId,
      reused: true,
    });
  }

  const apiKey = randomUUID();
  const r = await pool.query<{ id: string; table_label: string | null }>(
    `insert into devices (venue_id, table_label, device_code, api_key)
     values ($1,$2,$3,$4)
     returning id, table_label`,
    [venueId, body.table_label ?? "Table", body.device_code, apiKey]
  );

  return j({
    device_id: r.rows[0].id,
    api_key: apiKey,
    table_label: r.rows[0].table_label ?? "Table",
    venue_id: venueId,
    reused: false,
  });
}
