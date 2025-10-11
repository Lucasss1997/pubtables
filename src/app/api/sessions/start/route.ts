export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { pool, j, requireDevice } from "@/lib";

type Body = { minutes?: number };

export async function POST(req: Request) {
  const { device, error } = await requireDevice(pool, req);
  if (error) return error;

  const body = (await req.json()) as Body;
  const minutes = body.minutes ?? 60;

  const r = await pool.query(
    `insert into sessions (device_id, starts_at, ends_at, status)
     values ($1, now(), now() + ($2 || ' minutes')::interval, 'running')
     returning id, starts_at, ends_at, status`,
    [device.id, minutes]
  );

  return j({ session: r.rows[0] });
}
