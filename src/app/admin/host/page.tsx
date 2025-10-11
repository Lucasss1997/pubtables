"use client";
import { useEffect, useState } from "react";

type DeviceRow = {
  id: string;
  table_label: string | null;
  device_code: string;
  last_seen: string | null;
  session_id: string | null;
  session_status: "running" | "scheduled" | "stopped" | "ended" | null;
  starts_at: string | null;
  ends_at: string | null;
};

type Overview = { devices: DeviceRow[] };

function fmtAgo(iso: string | null) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

function remaining(endIso: string | null) {
  if (!endIso) return null;
  const diff = new Date(endIso).getTime() - Date.now();
  if (diff <= 0) return "00:00";
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Host() {
  const [adminKey, setAdminKey] = useState<string>("");
  const [data, setData] = useState<Overview | null>(null);
  const [minutesById, setMinutesById] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);

  // read cached admin key
  useEffect(() => {
    const k = localStorage.getItem("ADMIN_KEY");
    if (k) setAdminKey(k);
  }, []);

  // poll overview every 10s
  useEffect(() => {
    if (!adminKey) return;
    let timer: number | undefined;

    const load = async () => {
      try {
        const res = await fetch("/api/admin/overview", {
          headers: { "X-Admin-Key": adminKey },
          cache: "no-store",
        });
        const json = (await res.json()) as Overview;
        setData(json);
      } catch {
        // ignore network errors
      }
      timer = window.setTimeout(load, 10_000);
    };

    load();

    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [adminKey]);

  const setMins = (id: string, v: number) =>
    setMinutesById((p) => ({ ...p, [id]: Math.max(1, Math.min(240, v)) }));

  const start = async (id: string) => {
    if (!adminKey) return setMsg("Enter admin key");
    const minutes = minutesById[id] ?? 60;
    const res = await fetch("/api/admin/session/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": adminKey,
      },
      body: JSON.stringify({ device_id: id, minutes }),
    });
    setMsg(res.ok ? "Session started" : "Failed to start");
  };

  const stop = async (id: string) => {
    if (!adminKey) return setMsg("Enter admin key");
    const res = await fetch("/api/admin/session/stop", {
      method: "POST",
      headers: { "X-Admin-Key": adminKey },
      body: JSON.stringify({ device_id: id }),
    });
    setMsg(res.ok ? "Session stopped" : "Failed to stop");
  };

  return (
    <main className="min-h-screen p-6 space-y-4">
      <h1 className="text-2xl font-bold">Host Dashboard</h1>

      <div className="p-4 border rounded-xl space-y-3 max-w-xl">
        <label className="block text-sm font-medium">Admin Key</label>
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="enter admin key"
          value={adminKey}
          onChange={(e) => {
            setAdminKey(e.target.value);
            localStorage.setItem("ADMIN_KEY", e.target.value);
          }}
        />
        {msg && <div className="text-sm opacity-70">{msg}</div>}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data?.devices.map((d) => {
          const left = remaining(d.ends_at);
          const running = d.session_status === "running";
          return (
            <div key={d.id} className="p-4 border rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold">
                  {d.table_label || d.device_code}
                </div>
                <div
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    running ? "bg-green-100 text-green-700" : "bg-gray-100"
                  }`}
                >
                  {running ? "running" : "idle"}
                </div>
              </div>

              <div className="text-sm opacity-70">
                Last seen: {fmtAgo(d.last_seen)}
              </div>

              <div className="text-3xl font-mono">{left || "—"}</div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={240}
                  className="w-24 border rounded px-2 py-1"
                  value={minutesById[d.id] ?? 60}
                  onChange={(e) => setMins(d.id, Number(e.target.value))}
                />
                <button
                  onClick={() => start(d.id)}
                  className="px-3 py-1 rounded bg-black text-white"
                >
                  Start
                </button>
                <button
                  onClick={() => stop(d.id)}
                  className="px-3 py-1 rounded border"
                >
                  Stop
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
