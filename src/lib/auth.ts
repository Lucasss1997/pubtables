import { Pool } from "pg";
import { j, bad } from "./resp";

// Read 'X-Device-Key' and return the device row
export async function requireDevice(pool: Pool, req: Request) {
  const apiKey =
    req.headers.get("x-device-key") ||
    req.headers.get("X-Device-Key") ||
    undefined;

  if (!apiKey) return { error: bad("Missing X-Device-Key header", 401) };

  const r = await pool.query(
    "select * from devices where api_key = $1 and is_active = true",
    [apiKey]
  );
  if (r.rowCount === 0) return { error: bad("Invalid device key", 401) };

  return { device: r.rows[0] };
}

// Ensure we have at least one venue (used if venue_id not supplied)
export async function ensureDefaultVenue(pool: Pool) {
  let v = await pool.query("select id from venues order by created_at asc limit 1");
  if (v.rowCount === 0) {
    v = await pool.query(
      "insert into venues (name, timezone) values ($1,$2) returning id",
      ["Default Venue", "Europe/London"]
    );
  }
  return v.rows[0].id as string;
}
