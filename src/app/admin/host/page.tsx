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
  const s = Math.max(0, Math.floor(ms / 1000));
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
  const [inputKey, setInputKey] = useState<string>("");
  const [adminKey, setAdminKey] = useState<string>(""); // verified, in-memory
  const [remember, setRemember] = useState<boolean>(false);
  const [show, setShow] = useState<boolean>(false);
  const [data, setData] = useState<Overview | null>(null);
  const [minutesById, setMinutesById] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);

  // Restore from sessionStorage only if present
  useEffect(() => {
    const saved = sessionStorage.getItem("ADMIN_KEY");
    if (saved) {
      setInputKey(saved);
      setRemember(true);
    }
  }, []);

  // Poll overview every 10s only when connected
  useEffect(() => {
    if (!connected || !adminKey) return;
    let timer: number | undefined;

    const load = async () => {
      try {
        const res = await fetch("/api/admin/overview", {
          headers: { "X-Admin-Key": adminKey },
          cache: "no-store",
        });
        if (!res.ok) {
          if (res.status === 401) {
            setMsg("Invalid admin key");
            setConnected(false);
            setData(null);
            setInputKey(""); // 👈 clear key immediately on invalid entry
            sessionStorage.removeItem("ADMIN_KEY");
            return;
          }
          setMsg("Failed to load overview");
          return;
        }
        const json = (await res.json()) as Overview;
        setData(json);
        setMsg(null);
      } catch {
        setMsg("Network error");
      }
      timer = window.setTimeout(load, 10_000);
    };

    load();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [connected, adminKey]);

  const connect = async () => {
    setMsg(null);
    setConnected(false);
    setData(null);

    const res = await fetch("/api/admin/overview", {
      headers: { "X-Admin-Key": inputKey },
      cache: "no-store",
    });

    if (!res.ok) {
      setMsg(res.status === 401 ? "Invalid admin key" : "Unable to connect");
      setInputKey(""); // 👈 immediately clear wrong key
      return;
    }

    // Store in sessionStorage if user chose "Remember"
    if (remember) sessionStorage.setItem("ADMIN_KEY", inputKey);
    else sessionStorage.removeItem("ADMIN_KEY");

    setAdminKey(inputKey);
    setConnected(true);
  };

  const disconnect = () => {
    setConnected(false);
    setAdminKey("");
    setData(null);
    setMsg("Disconnected");
    sessionStorage.removeItem("ADMIN_KEY");
    setInputKey("");
    setRemember(false);
  };

  const setMins = (id: string, v: number) =>
    setMinutesById((p) => ({ ...p, [id]: Math.max(1, Math.min(240, v)) }));

  const start = async (id: string) => {
    if (!connected || !adminKey) return setMsg("Connect with admin key first");
    const minutes = minutesById[id] ?? 60;
    const res = await fetch("/api/admin/session/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": adminKey,
      },
      body: JSON.stringify({ device_id: id, minutes }),
    });
    setMsg(
      res.ok
        ? "Session started"
        : res.status === 401
        ? "Invalid admin key"
        : "Failed to start session"
    );
  };

  const stop = async (id: string) => {
    if (!connected || !adminKey) return setMsg("Connect with admin key first");
    const res = await fetch("/api/admin/session/stop", {
      method: "POST",
      headers: { "X-Admin-Key": adminKey, "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: id }),
    });
    setMsg(
      res.ok
        ? "Session stopped"
        : res.status === 401
        ? "Invalid admin key"
        : "Failed to stop session"
    );
  };

  return (
    <main className="min-h-screen p-6 space-y-4">
      <h1 className="text-2xl font-bold">Host Dashboard</h1>

      {/* --- Admin Key Box --- */}
      <div className="p-4 border rounded-xl space-y-3 max-w-xl">
        <label className="block text-sm font-medium mb-1">Admin Key</label>
        <div className="flex gap-2 items-center relative max-w-md">
          <input
            type={show ? "text" : "password"} // 👁 hidden by default
            inputMode="numeric"
            autoComplete="off"
            placeholder="Enter admin key"
            className="flex-1 border rounded px-3 py-2 pr-10 text-lg tracking-widest"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 text-sm text-gray-500 hover:text-black"
            title={show ? "Hide key" : "Show key"}
          >
            {show ? "🙈" : "👁"}
          </button>
          {!connected ? (
            <button
              onClick={connect}
              className="ml-2 px-3 py-2 rounded bg-black text-white"
            >
              Connect
            </button>
          ) : (
            <button
              onClick={disconnect}
              className="ml-2 px-3 py-2 rounded border"
            >
              Disconnect
            </button>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm opacity-80">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember on this browser (clears when tab closes)
        </label>

        <div className="text-sm opacity-70">
          {connected ? "Connected" : "Not connected"}
          {msg ? ` — ${msg}` : ""}
        </div>
      </div>

      {/* --- Devices Grid --- */}
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
                    running
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
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
