export async function GET() {
  const pooled = process.env.DATABASE_URL || "";
  const direct = process.env.DIRECT_DATABASE_URL || "";

  // tiny masker to avoid printing the password
  const mask = (url: string) => {
    try {
      const u = new URL(url);
      const user = u.username || "";
      const host = u.host || "";
      const db = u.pathname || "";
      const hasPooler = host.includes("-pooler");
      return {
        user,
        host,
        db,
        hasPooler,
        // show last 6 chars of password to verify which one it is without leaking it
        pwTail: (u.password || "").slice(-6),
        raw: false
      };
    } catch {
      return { raw: url, rawPresent: !!url };
    }
  };

  return new Response(
    JSON.stringify({
      envLoaded: process.env.__NEXT_PRIVATE_PREBUNDLED_REACT ? "unknown" : "ok",
      databaseUrl: mask(pooled),
      directDatabaseUrl: mask(direct),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
