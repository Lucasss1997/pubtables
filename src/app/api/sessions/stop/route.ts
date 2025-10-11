import { pool } from "../../../../../lib/db";
import { j, bad } from "../../../../../lib/resp";
import { requireDevice } from "../../../../../lib/auth";

export async function POST(req: Request) {
  const { device, error } = await requireDevice(pool, req);
  if (error) return error;

  const cur = await pool.query(
    `select id from sessions
     where device_id = $1 and status = 'running'
     order by starts_at desc limit 1`,
    [device.id]
  );
  if (cur.rowCount === 0) return bad("No running session", 404);

  const id = cur.rows[0].id;
  const r = await pool.query(
    `update sessions set status = 'ended', ends_at = now()
     where id = $1
     returning id, starts_at, ends_at, status`,
    [id]
  );
  return j({ session: r.rows[0] });
}
