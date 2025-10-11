export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { pool, j, requireDevice } from "@/lib";

export async function POST(req: Request) {
  const { device, error } = await requireDevice(pool, req);
  if (error) return error;

  await pool.query(`update devices set last_seen = now() where id = $1`, [device.id]);
  return j({ ok: true });
}
