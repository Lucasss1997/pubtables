export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { j, bad } from "@/lib/resp";
import { requireAdmin } from "@/lib/admin";

type Body = { device_id: string };

export async function POST(req: Request) {
  const adm = requireAdmin(req);
  if ("error" in adm) return adm.error;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !body.device_id) return bad("device_id is required");

  const cur = await pool.query<{ id: string }>(
    `select id from sessions
     where device_id = $1 and status = 'running'
     order by starts_at desc limit 1`,
    [body.device_id]
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
