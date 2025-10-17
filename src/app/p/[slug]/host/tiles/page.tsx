// app/p/[slug]/host/tiles/page.tsx
"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type TableInfo = { id: string; label?: string };
type ScheduleItem = {
  id: string;
  tableId: string;
  startAt: string;
  endAt: string;
  type?: "booking" | "session";
};
type Tile = { tableId: string; live: boolean; liveUntil?: Date; nextStart?: Date; loading: boolean };

function fmtHM(d?: Date) {
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
const toDate = (iso: string) => new Date(iso);

export default function HostTiles() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const normSlug = (slug || "").toLowerCase();

  // Prefetch host routes for faster first nav
  useEffect(() => {
    if (!slug) return;
    const base = `/p/${encodeURIComponent((slug as string))}`;
    router.prefetch(`${base}/host`);
    router.prefetch(`${base}/host/master`);
  }, [router, slug]);

  // 🔐 read PIN (supports both keys)
  const [pin, setPin] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const p =
      typeof window !== "undefined"
        ? sessionStorage.getItem("hostPin") || sessionStorage.getItem("host_pin")
        : null;
    if (p && p.length === 6) setPin(p);
    setReady(true); // no artificial delay
  }, []);

  // tables list
  const [tables, setTables] = useState<TableInfo[]>([]);
  useEffect(() => {
    if (!normSlug) return;
    (async () => {
      try {
        const res = await fetch(`/api/tables?slug=${encodeURIComponent(normSlug)}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const list = data?.tables ?? [];
          if (Array.isArray(list) && list.length) {
            if (typeof list[0] === "string") {
              setTables(list.map((id: string) => ({ id, label: id })));
              return;
            }
            setTables(list as TableInfo[]);
            return;
          }
        }
      } catch {}
      // reasonable default if API empty
      setTables([
        { id: "seed-table-1", label: "Table 1" },
        { id: "seed-table-2", label: "Table 2" },
        { id: "seed-table-3", label: "Table 3" },
        { id: "seed-table-4", label: "Table 4" },
      ]);
    })();
  }, [normSlug]);

  // tiles data
  const [grid, setGrid] = useState<Record<string, Tile>>({});
  const labelFor = useMemo(() => Object.fromEntries(tables.map(t => [t.id, t.label ?? t.id])), [tables]);

  async function refresh() {
    if (!pin || !tables.length) return;
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
    const ids = tables.map(t => t.id).join(",");

    const res = await fetch(
      `/api/schedule/all?slug=${encodeURIComponent(normSlug)}&date=${dateStr}&tables=${encodeURIComponent(ids)}`,
      { headers: { "x-host-pin": pin }, cache: "no-store" }
    );
    if (!res.ok) return;
    const data = (await res.json()) as { items?: ScheduleItem[] };
    const items = data.items || [];

    const now = new Date();
    const updates: Record<string, Tile> = {};
    for (const t of tables) {
      const tableItems = items
        .filter(i => i.tableId === t.id)
        .sort((a, b) => +toDate(a.startAt) - +toDate(b.startAt));

      let live = false, liveUntil: Date | undefined, nextStart: Date | undefined;
      for (const s of tableItems) {
        const st = toDate(s.startAt), en = toDate(s.endAt);
        if (st <= now && now < en) { live = true; liveUntil = en; break; }
        if (!live && !nextStart && st > now) nextStart = st;
      }
      updates[t.id] = { tableId: t.id, live, liveUntil, nextStart, loading: false };
    }
    setGrid(prev => ({ ...prev, ...updates }));
  }

  // initial + interval
  useEffect(() => {
    if (!pin || !tables.length) return;
    const init: Record<string, Tile> = {};
    tables.forEach(t => (init[t.id] = { tableId: t.id, live: false, loading: true }));
    setGrid(init);
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, tables]);

  // unified navigation to the actual table host view (query + hash)
  function openTable(tableId: string) {
    const url = `/p/${encodeURIComponent(normSlug)}/host?table=${encodeURIComponent(tableId)}#${encodeURIComponent(tableId)}`;
    router.push(url);
  }

  if (!ready) {
    return (
      <main className="min-h-dvh bg-black text-white flex items-center justify-center">
        <div className="opacity-70">Loading…</div>
      </main>
    );
  }

  if (!pin) {
    return (
      <main className="min-h-dvh bg-black text-white flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-red-400 mb-3">No PIN found. Please authenticate via Host Controls first.</div>
          <a
            href={`/admin?slug=${encodeURIComponent(normSlug)}`}
            className="inline-block text-sm px-4 py-2 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15"
          >
            Go to Host Controls
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-black text-white p-4">
      <div className="w-full max-w-6xl mx-auto">
        {/* Header with link to Master Schedule */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold">{normSlug} · Tables</div>
          <a
            href={`/p/${encodeURIComponent(normSlug)}/host/master`}
            className="rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15 text-white font-semibold text-sm px-5 py-2.5"
          >
            Master Schedule
          </a>
        </div>

        {/* Tiles grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {tables.map((t) => {
            const tile = grid[t.id];
            const isLive = tile?.live;
            const line1 = isLive ? `Live until ${fmtHM(tile?.liveUntil)}` : "Free";
            const line2 = !isLive ? (tile?.nextStart ? `Next ${fmtHM(tile?.nextStart)}` : "No more today") : "";

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => openTable(t.id)}
                className={`aspect-[2/1] rounded-2xl p-3 flex flex-col items-center justify-center ${
                  isLive ? "bg-emerald-500/90 text-white" : "bg-white text-black"
                } pointer-events-auto`}
                title={labelFor[t.id] || t.id}
                aria-label={`Open ${labelFor[t.id] || t.id}`}
              >
                <div className="text-2xl font-bold">{labelFor[t.id] || t.id}</div>
                <div className={`text-sm ${isLive ? "text-white" : "text-black/70"}`}>
                  {tile?.loading ? "…" : line1}
                </div>
                {!isLive && (
                  <div className="text-xs text-black/50">
                    {tile?.loading ? "" : line2}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={refresh}
            className="text-xs underline underline-offset-4 text-white/70 hover:text-white"
          >
            Refresh
          </button>
          <div className="text-[11px] text-white/40">Auto-refresh every 30s</div>
        </div>
      </div>
    </main>
  );
}
