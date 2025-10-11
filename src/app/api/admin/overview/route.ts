export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { pool, j, requireAdmin } from "@/lib";

type Row = {
  id: string;
  table_label: string | null;
  device_code: string;
  last_seen: string | null;
  session_id: string | null;
  session_status: "running" | "scheduled" | "stopped" | "ended" | null;
  starts_at: string | null;
  ends_at: string | null;
};

export async function GET(req: Request) {
  const adm = requireAdmin(req);
  if ("error" in adm) return adm.error;

  const r = await pool.query<Row>(`
    select
      d.id,
      d.table_label,
      d.device_code,
      d.last_seen,
      s.id as session_id,
      s.status as session_status,
      s.starts_at,
      s.ends_at
    from devices d
    left join lateral (
      select id, status, starts_at, ends_at
      from sessions
      where device_id = d.id and status = 'running'
      order by starts_at desc
      limit 1
    ) s on true
    order by d.table_label nulls last, d.created_at asc
  `);

  return j({ devices: r.rows });
}
