import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

const globalForPool = global as unknown as { _pool?: Pool };

export const pool =
  globalForPool._pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

if (!globalForPool._pool) globalForPool._pool = pool;
