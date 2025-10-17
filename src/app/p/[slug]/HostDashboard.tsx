"use client";

import * as React from "react";
import { useParams } from "next/navigation";

type TableInfo = { id: string; label?: string };
type ScheduleItem = {
  id: string;
  tableId: string;
  startAt: string;
  endAt: string;
  type?: "booking" | "session";
  status?: "ACTIVE" | "ARRIVED" | "NO_SHOW" | "CANCELLED" | "COMPLETED";
  partyName?: string | null;
};

const sanitizePin = (s: string) => (s || "").replace(/\D/g, "").slice(0, 6);
const isPin = (p: string) => /^\d{6}$/.test(p);
const fmtHM = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function HostDashboard() {
  const { slug } = useParams<{ slug: string }>();

  const [pin, setPin] = React.useState<string>("");
  const [tables, setTables] = React.useState<TableInfo[]>([]);
  const [items, setItems] = React.useState<ScheduleItem[]>([]);
  const [date, setDate] = React.useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [loading, setLoading] = React.useState(true);

  // Normalize PIN in sessionStorage (Edge/Chrome)
  React.useEffect(() => {
    try {
      const a = sessionStorage.getItem("host_pin") || "";
      const b = sessionStorage.getItem("hostPin") || "";
      const p = sanitizePin(a || b);
      if (isPin(p)) {
        sessionStorage.setItem("host_pin", p);
        sessionStorage.setItem("hostPin", p);
        setPin(p);
      }
    } catch {}
  }, []);

  // Load tables list
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tables?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch tables");
        const data = await res.json();
        const list = (data?.tables ?? []) as (string | TableInfo)[];
        const normalized = Array.isArray(list) && list.length
          ? (typeof list[0] === "string" ? (list as string[]).map(id => ({ id, label: id })) : (list as TableInfo[]))
          : [{ id: "seed-table-1" }, { id: "seed-table-2" }, { id: "seed-table-3" }, { id: "seed-table-4" }];
        if (!cancelled) setTables(normalized);
      } catch {
        if (!cancelled) {
          setTables([{ id: "seed-table-1" }, { id: "seed-table-2" }, { id: "seed-table-3" }, { id: "seed-table-4" }]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Poll schedule for “live/next” info
  const loadDay = React.useCallback(async () => {
    if (!pin || !isPin(pin) || !tables.length) return;
    setLoading(true);
    try {
      const ids = tables.map(t => t.id);
      const res = await fetch(
        `/api/schedule/all?slug=${encodeURIComponent(slug)}&date=${date}&tables=${encodeURIComponent(ids.join(","))}`,
        { headers: { "x-host-pin": pin }, cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to fetch items");
      const data = await res.json() as { items?: ScheduleItem[] };
      setItems(data.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [pin, date, tables, slug]);

  React.useEffect(() => {
    loadDay();
    const id = setInterval(loadDay, 30_000);
    return () => clearInterval(id);
  }, [loadDay]);

  const now = React.useMemo(() => new Date(), [items]); // cheap “now” update after poll

  return (
    <div className="rounded-2xl border border-white/10 p-4">
      <div className="mb-3 flex items-center gap-3">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-sm"
        />
        <button
          type="button"
          onClick={loadDay}
          className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15 text-sm"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {tables.map((t) => {
          const tItems = items
            .filter(i => i.tableId === t.id)
            .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));

          let live = null as ScheduleItem | null;
          let next = null as ScheduleItem | null;
          for (const it of tItems) {
            const s = new Date(it.startAt), e = new Date(it.endAt);
            if (s <= now && now < e) { live = it; break; }
            if (!next && s > now) next = it;
          }

          return (
            <a
              key={t.id}
              href={`/p/${encodeURIComponent(slug)}/host#${encodeURIComponent(t.id)}`}
              className={`aspect-[2/1] rounded-2xl p-3 flex flex-col items-center justify-center ${live ? "bg-emerald-500/90 text-white" : "bg-white text-black"}`}
              aria-label={`Open table ${t.label || t.id}`}
            >
              <div className="text-2xl font-bold">{t.label || t.id}</div>
              {loading ? (
                <div className={`${live ? "text-white" : "text-black/70"} text-sm`}>…</div>
              ) : live ? (
                <div className="text-sm">Live · until {fmtHM(new Date(live.endAt))}</div>
              ) : next ? (
                <div className="text-sm text-black/70">Next {fmtHM(new Date(next.startAt))}</div>
              ) : (
                <div className="text-sm text-black/70">Free</div>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
