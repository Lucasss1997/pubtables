export function requireAdmin(req: Request) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return { ok: true }; // no protection configured
  const got = req.headers.get("x-admin-key") ?? "";
  if (got !== expected) {
    return {
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    };
  }
  return { ok: true };
}
