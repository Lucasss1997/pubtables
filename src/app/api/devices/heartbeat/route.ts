import { pool } from "../../../../lib/db";
import { j, bad } from "../../../../lib/resp";
import { requireDevice } from "../../../../lib/auth";

export async function POST(req: Request) {
  const { device, error } = await requireDevice(pool, req);
  if (error) return error;
  await pool.query("update devices set last_seen = now() where id = $1", [device.id]);
  return j({ ok: true, now: new Date().toISOString() });
}
