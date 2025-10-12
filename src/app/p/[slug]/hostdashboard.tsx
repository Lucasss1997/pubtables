"use client";

import { useEffect, useMemo, useState } from "react";

type Table = { id: string; label: string };
type Item =
  | {
      id: string;
      tableId: string;
      startAt: string; // ISO
      endAt: string;   // ISO
      partyName: string | null;
      notes: string | null;
      type: "booking";
    }
  | {
      id: string;
      tableId: string;
      startAt: string; // ISO
      endAt: string;   // ISO
      partyName: string | null; // “Walk-in” or status
      status: string;           // e.g., "active"
      type: "session";
    };

type ApiPayload = {
  pub: { id: string; name: string; slug: string };
  date: string; // YYYY-MM-DD
  window: { start: string; end: string };
  tables: Table[];
  items: Item[];
  stats: { totalTables: number; totalBookings: number; totalSessions: number };
};

export default function HostDashboard({
  slug,
  date,
  autoRefreshMs = 60000,
}: {
  slug: string;
  date?: string; // YYYY-MM-DD
  autoRefreshMs?: number;
}) {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const q = new URLSearchParams({ slug, ...(date ? { date } : {}) });
    const res = await fetch(`/api/schedule/all?${q.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      console.error("Failed to load:", await res.text());
      setData(null);
      setLoading(false);
      return;
    }
    setData((await res.json()) as ApiPayload);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const id = setInterval(load, autoRefreshMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, date]);

  const itemsByTable = useMemo(() => {
    const map = new Map<string, Item[]>();
    (data?.items ?? []).forEach((it) => {
      const arr = map.get(it.tableId) ?? [];
      arr.push(it);
      map.set(it.tableId, arr);
    });
    // sort per table by startAt ascending
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      map.set(k, arr);
    }
    return map;
  }, [data]);

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading schedule…</div>;
  if (!data) return <div className="p-6 text-sm text-red-600">Failed to load schedule.</div>;

  return (
    <div className="p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Host Dashboard</h1>
          <p className="text-sm text-gray-500">
            {data.pub.name} — {data.date}
          </p>
          <p className="text-xs text-gray-500">
            Tables: {data.stats.totalTables} · Bookings: {data.stats.totalBookings} · Sessions: {data.stats.totalSessions}
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-2 rounded-xl border text-sm hover:bg-gray-50"
        >
          Refresh
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.tables.map((t) => {
          const list = itemsByTable.get(t.id) ?? [];
          return (
            <div key={t.id} className="rounded-2xl border p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold">Table {t.label}</h2>
                <span className="text-xs text-gray-500">
                  {list.length} {list.length === 1 ? "item" : "items"}
                </span>
              </div>

              {list.length === 0 ? (
                <div className="text-sm text-gray-500">Free all day</div>
              ) : (
                <ul className="space-y-2">
                  {list.map((it) => (
                    <li key={it.id} className="rounded-xl border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {fmtTime(it.startAt)} – {fmtTime(it.endAt)}
                        </span>
                        <span
                          className={`text-xs px-2 py-1 rounded-full border ${
                            it.type === "booking"
                              ? "bg-white"
                              : "bg-white"
                          }`}
                          title={it.type === "session" ? (it as any).status ?? "" : ""}
                        >
                          {it.type}
                        </span>
                      </div>
                      <div className="text-gray-700">
                        {it.partyName || (it.type === "session" ? (it as any).status : "—")}
                      </div>
                      {"notes" in it && it.notes ? (
                        <div className="text-xs text-gray-500 mt-1">{it.notes}</div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
