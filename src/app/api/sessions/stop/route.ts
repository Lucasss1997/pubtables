export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { pool, j, bad, requireDevice } from "@/lib";

export async function POST(req: Request) {
  const { device, error } = await requireDevice(pool, req);
  if (error) return error;

  const r = await pool.query(
    `update sessions
     set status = 'stopped', ends_at = now()
     where device_id = $1 and status = 'running'
     returning id, starts_at, ends_at, status`,
    [device.id]
  );

  if (r.rowCount === 0) return bad("No running session found");
  return j({ session: r.rows[0] });
}
