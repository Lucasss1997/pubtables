"use client";
import { useEffect, useMemo, useState } from "react";

type Session = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "running" | "scheduled" | "stopped" | "ended";
};

type StatusResponse = { session: Session | null; error?: string };

export default function Admin() {
  const [deviceKey, setDeviceKey] = useState<string>("");
  const [minutes, setMinutes] = useState<number>(60);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  // Poll status every 5s if we have a key
  useEffect(() => {
    if (!deviceKey) return;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const res = await fetch("/api/sessions/status", {
          headers: { "X-Device-Key": deviceKey },
        });
        const json: StatusResponse = await res.json();
        setStatus(json);
      } catch {
        // ignore
      }
      timer = window.setTimeout(tick, 5000);
    };

    tick();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [deviceKey]);

  const remaining = useMemo(() => {
    const sess = status?.session;
    if (!sess) return null;
    const end = new Date(sess.ends_at).getTime();
    const diff = Math.max(0, end - Date.now());
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, [status]);

  const start = async () => {
    if (!deviceKey) return setMessage("Enter a device key first");
    setLoading(true);
    try {
      const res = await fetch("/api/sessions/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Key": deviceKey,
        },
        body: JSON.stringify({ minutes }),
      });
      setMessage(res.ok ? "Session started" : "Failed to start session");
      const json: StatusResponse = await res.json();
      setStatus(json);
    } finally {
      setLoading(false);
    }
  };

  const stop = async () => {
    if (!deviceKey) return setMessage("Enter a device key first");
    setLoading(true);
    try {
      const res = await fetch("/api/sessions/stop", {
        method: "POST",
        headers: { "X-Device-Key": deviceKey },
      });
      setMessage(res.ok ? "Session stopped" : "Failed to stop session");
      const json: StatusResponse = await res.json();
      setStatus(json);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-6 space-y-6">
      <h1 className="text-2xl font-bold">PubTables Admin</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="p-4 border rounded-xl space-y-3">
          <label className="block text-sm font-medium">Device Key</label>
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="paste API key"
            value={deviceKey}
            onChange={(ev) => setDeviceKey(ev.target.value)}
          />
          <label className="block text-sm font-medium">Minutes</label>
          <input
            type="number"
            className="w-full border rounded px-3 py-2"
            min={1}
            max={240}
            value={minutes}
            onChange={(ev) => setMinutes(Number(ev.target.value))}
          />
          <div className="flex gap-3">
            <button
              onClick={start}
              disabled={loading}
              className="px-4 py-2 rounded bg-black text-white"
            >
              Start
            </button>
            <button
              onClick={stop}
              disabled={loading}
              className="px-4 py-2 rounded border"
            >
              Stop
            </button>
          </div>
          {message && <p className="text-sm opacity-70">{message}</p>}
        </div>

        <div className="p-4 border rounded-xl space-y-3">
          <h2 className="text-lg font-semibold">Status</h2>
          <pre className="bg-black/5 p-3 rounded text-sm overflow-auto">
            {JSON.stringify(status, null, 2)}
          </pre>
          <div className="text-3xl font-mono">
            {remaining ? `⏱ ${remaining}` : "—"}
          </div>
        </div>
      </div>
    </main>
  );
}
