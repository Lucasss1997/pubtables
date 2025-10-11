export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { pool, j, bad, requireAdmin } from "@/lib";

type Body = { device_id: string; minutes?: number };

export async function POST(req: Request) {
  const adm = requireAdmin(req);
  if ("error" in adm) return adm.error;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !body.device_id) return bad("device_id is required");

  const minutes = Math.max(1, Math.min(240, body.minutes ?? 60));

  const dv = await pool.query<{ venue_id: string }>(
    "select venue_id from devices where id = $1",
    [body.device_id]
  );
  if (dv.rowCount === 0) return bad("Device not found", 404);
  const venueId = dv.rows[0].venue_id;

  const r = await pool.query(
    `insert into sessions (venue_id, device_id, starts_at, ends_at, status)
     values ($1, $2, now(), now() + ($3 || ' minutes')::interval, 'running')
     returning id, starts_at, ends_at, status`,
    [venueId, body.device_id, String(minutes)]
  );

  return j({ session: r.rows[0] });
}
