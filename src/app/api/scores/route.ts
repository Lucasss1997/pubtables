export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { pool, j, bad, requireDevice } from "@/lib";

type Body = {
  game_id: string;        // e.g. "pong" or "quiz1"
  player_name?: string;   // optional
  score: number;          // integer points
  session_id?: string;    // optional; will auto-detect current running session if omitted
};

async function ensureScoresTable() {
  await pool.query(`
    create table if not exists scores (
      id uuid primary key default gen_random_uuid(),
      device_id uuid not null references devices(id) on delete cascade,
      session_id uuid references sessions(id) on delete set null,
      game_id text not null,
      player_name text,
      score integer not null,
      created_at timestamptz not null default now()
    );
    create index if not exists idx_scores_game_created on scores (game_id, created_at desc);
    create index if not exists idx_scores_device_created on scores (device_id, created_at desc);
  `);
}

export async function POST(req: Request) {
  const { device, error } = await requireDevice(pool, req);
  if (error) return error;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return bad("Invalid JSON");
  if (!body.game_id) return bad("game_id is required");
  if (typeof body.score !== "number" || !Number.isFinite(body.score)) return bad("score must be a number");

  await ensureScoresTable();

  // Resolve session: use provided session_id or current running one
  let sessionId = body.session_id ?? null;
  if (!sessionId) {
    const cur = await pool.query<{ id: string }>(
      `select id from sessions
       where device_id = $1 and status = 'running'
       order by starts_at desc limit 1`,
      [device.id]
    );
    sessionId = cur.rowCount ? cur.rows[0].id : null;
  }

  const r = await pool.query(
    `insert into scores (device_id, session_id, game_id, player_name, score)
     values ($1,$2,$3,$4,$5)
     returning id, device_id, session_id, game_id, player_name, score, created_at`,
    [device.id, sessionId, body.game_id, body.player_name ?? null, Math.trunc(body.score)]
  );

  return j({ score: r.rows[0] }, 201);
}
