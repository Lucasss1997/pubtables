"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import SecurePinInput from "../../components/SecurePinInput";

type Session = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "running" | "scheduled" | "stopped" | "ended";
};

type StatusResponse = { session: Session | null; error?: string };

export default function AdminPage() {
  // --- Auth gate via pub-level PIN ---
  const sp = useSearchParams();
  const urlSlug = (sp.get("slug") || "theriser").toLowerCase();

  const [authed, setAuthed] = useState(false);
  const [checkedAuth, setCheckedAuth] = useState(false);

  useEffect(() => {
    try {
      const storedSlug = (sessionStorage.getItem("slug") || "").toLowerCase();
      const hostPin = sessionStorage.getItem("hostPin") || "";
      // Simple check: must have a PIN and (slug matches URL or URL absent)
      if (hostPin && (!storedSlug || storedSlug === urlSlug)) {
        // Normalize the slug we operate on
        sessionStorage.setItem("slug", urlSlug);
        setAuthed(true);
      } else {
        setAuthed(false);
      }
    } catch {
      setAuthed(false);
    } finally {
      setCheckedAuth(true);
    }
  }, [urlSlug]);

  if (!checkedAuth) {
    // Avoid flicker
    return (
      <main className="min-h-screen grid place-items-center text-slate-200">
        <div className="opacity-70">Loading…</div>
      </main>
    );
  }

  if (!authed) {
    // No valid PIN session — show the PIN screen for this pub
    return <SecurePinInput slug={urlSlug} />;
  }

  // --- Your existing admin UI (with tiny UX tweaks) ---
  const [deviceKey, setDeviceKey] = useState<string>("");
  const [minutes, setMinutes] = useState<number>(60);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  // Autofocus device key for tablet flow
  const keyInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const t = setTimeout(() => keyInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Poll status every 5s if we have a key
  useEffect(() => {
    if (!deviceKey) return;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const res = await fetch("/api/sessions/status", {
          headers: {
            "X-Device-Key": deviceKey,
            "X-Pub-Slug": urlSlug, // optional: pass slug along if your API needs it
          },
        });
        const json: StatusResponse = await res.json();
        setStatus(json);
      } catch {
        // ignore network errors in poll loop
      }
      timer = window.setTimeout(tick, 5000);
    };

    tick();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [deviceKey, urlSlug]);

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
          "X-Pub-Slug": urlSlug, // optional
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
        headers: {
          "X-Device-Key": deviceKey,
          "X-Pub-Slug": urlSlug, // optional
        },
      });
      setMessage(res.ok ? "Session stopped" : "Failed to stop session");
      const json: StatusResponse = await res.json();
      setStatus(json);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem("hostPin");
    // keep slug to preserve routing
    setAuthed(false);
  };

  return (
    <main className="min-h-screen p-6 space-y-6 text-slate-100 bg-slate-900">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          PubTables Admin <span className="opacity-60">/ {urlSlug}</span>
        </h1>
        <button
          onClick={logout}
          className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600"
        >
          Logout
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="p-4 border border-slate-700 rounded-xl space-y-3 bg-slate-800/40">
          <label className="block text-sm font-medium">Device Key</label>
          <input
            ref={keyInputRef}
            className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded px-3 py-2"
            placeholder="paste API key"
            value={deviceKey}
            onChange={(ev) => setDeviceKey(ev.target.value)}
          />
          <label className="block text-sm font-medium">Minutes</label>
          <input
            type="number"
            className="w-full border border-slate-600 bg-slate-800 text-slate-100 rounded px-3 py-2"
            min={1}
            max={240}
            value={minutes}
            onChange={(ev) => setMinutes(Number(ev.target.value))}
          />
          <div className="flex gap-3">
            <button
              onClick={start}
              disabled={loading}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white"
            >
              Start
            </button>
            <button
              onClick={stop}
              disabled={loading}
              className="px-4 py-2 rounded border border-slate-600 hover:bg-slate-800"
            >
              Stop
            </button>
          </div>
          {message && <p className="text-sm opacity-80">{message}</p>}
        </div>

        <div className="p-4 border border-slate-700 rounded-xl space-y-3 bg-slate-800/40">
          <h2 className="text-lg font-semibold">Status</h2>
          <pre className="bg-black/30 p-3 rounded text-sm overflow-auto">
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
