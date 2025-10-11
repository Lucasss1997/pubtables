export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { pool, j, bad, requireDevice } from "@/lib";

type Body = { minutes?: number };

export async function POST(req: Request) {
  const { device, error } = await requireDevice(pool, req);
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as Body;
  const minutes = Math.max(1, Math.min(240, body.minutes ?? 60));

  const dv = await pool.query<{ venue_id: string }>(
    "select venue_id from devices where id = $1",
    [device.id]
  );
  const venueId = dv.rows[0].venue_id;

  const r = await pool.query<{
    id: string; starts_at: string; ends_at: string; status: string;
  }>(
    `insert into sessions (venue_id, device_id, starts_at, ends_at, status)
     values ($1, $2, now(), now() + ($3 || ' minutes')::interval, 'running')
     returning id, starts_at, ends_at, status`,
    [venueId, device.id, String(minutes)]
  );

  return j({ session: r.rows[0] });
}
