// Small helpers for JSON responses
export const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const bad = (msg: string, status = 400) => j({ error: msg }, status);
