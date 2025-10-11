export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { pool, j, bad } from "@/lib";

function sinceClause(period: string | null) {
  switch ((period ?? "all").toLowerCase()) {
    case "today":
      return "and created_at >= date_trunc('day', now())";
    case "week":
      return "and created_at >= date_trunc('week', now())";
    case "month":
      return "and created_at >= date_trunc('month', now())";
    default:
      return ""; // all time
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const gameId = url.searchParams.get("game_id");
  const period = url.searchParams.get("period");  // today | week | month | all
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 10)));

  if (!gameId) return bad("game_id is required");

  // Make sure table exists (no-op if it does)
  await pool.query(`
    create table if not exists scores (
      id uuid primary key default gen_random_uuid(),
      device_id uuid not null references devices(id) on delete cascade,
      session_id uuid references sessions(id) on delete set null,
      game_id text not null,
      player_name text,
      score integer not null,
      created_at timestamptz not null default now()
    )
  `);

  const r = await pool.query(
    `
    select game_id,
           coalesce(player_name, 'Player') as player_name,
           score,
           created_at
    from scores
    where game_id = $1
      ${sinceClause(period)}
    order by score desc, created_at asc
    limit $2
    `,
    [gameId, limit]
  );

  return j({ game_id: gameId, period: period ?? "all", results: r.rows });
}
