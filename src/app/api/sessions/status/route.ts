export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { pool } from "@/lib/db";
import { j } from "@/lib/resp";
import { requireDevice } from "@/lib/auth";

export async function GET(req: Request) {
  const { device, error } = await requireDevice(pool, req);
  if (error) return error;

  const r = await pool.query<{
    id: string; starts_at: string; ends_at: string; status: string;
  }>(
    `select id, starts_at, ends_at, status
     from sessions
     where device_id = $1 and status in ('running','scheduled')
     order by starts_at desc limit 1`,
    [device.id]
  );

  if (r.rowCount === 0) return j({ session: null });
  return j({ session: r.rows[0] });
}
