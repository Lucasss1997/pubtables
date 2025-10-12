// app/p/[slug]/host/master/page.tsx
"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type ScheduleItem = {
  id: string;
  tableId: string;
  startAt: string;
  endAt: string;
  partyName?: string | null;
  notes?: string | null;
  type?: "booking" | "session";
  status?: "ACTIVE" | "ARRIVED" | "NO_SHOW" | "CANCELLED";
};

type TableInfo = { id: string; label?: string };
type Tile = { tableId: string; live: boolean; liveUntil?: Date; nextStart?: Date; loading: boolean };

function toDate(iso: string) { return new Date(iso); }
function fmtHM(d: Date) { return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function isoDateLocalToday(): string {
  const now = new Date(); const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function localDayStart(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}
const MIN_PER_SLOT = 15;
const SLOTS_PER_DAY = 24 * (60 / MIN_PER_SLOT);
function buildSlots(dayStart: Date): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < SLOTS_PER_DAY; i++) out.push(new Date(dayStart.getTime() + i * MIN_PER_SLOT * 60 * 1000));
  return out;
}
function parseTablesFromURL(search: URLSearchParams | null) {
  if (!search) return [] as string[];
  const raw = search.getAll("tables"); if (!raw.length) return [];
  const out: string[] = [];
  for (const r of raw) r.split(",").forEach(s => { const t = s.trim(); if (t) out.push(t); });
  return out;
}

// LIVE = green; BOOKED = amber; ARRIVED = light blue; NO_SHOW = grey
function cellClass(kind: "free" | "booking" | "live", status?: string) {
  if (kind === "live") return "bg-emerald-500/90 text-white";              // LIVE
  if (kind === "booking") {
    if (status === "ARRIVED") return "bg-sky-400/80 text-black";           // ARRIVED
    if (status === "NO_SHOW") return "bg-gray-400/60 text-black";          // NO-SHOW
    return "bg-amber-300 text-black";                                      // BOOKED (pending)
  }
  return "bg-white text-black"; // FREE
}

function roundTo15(d: Date, dir: "down" | "up" = "down") {
  const ms = 1000 * 60 * 15, t = d.getTime();
  return new Date((dir === "down" ? Math.floor(t / ms) : Math.ceil(t / ms)) * ms);
}

export default function MasterSchedule() {
  const { slug } = useParams<{ slug: string }>();
  const search = useSearchParams();

  const [view, setView] = useState<"day" | "tiles">("day");
  const [leaving, setLeaving] = useState(false);

  // PIN
  const [pin, setPin] = useState("");
  const [pinReady, setPinReady] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const cached = typeof window !== "undefined" ? sessionStorage.getItem("host_pin") : null;
    if (cached?.length === 6) { setPin(cached); setPinReady(true); }
    const t = setTimeout(() => setLoading(false), 100);
    return () => clearTimeout(t);
  }, []);

  // Date
  const [date, setDate] = useState<string>(isoDateLocalToday());
  const dayStart = useMemo(() => localDayStart(date), [date]);
  const daySlots = useMemo(() => buildSlots(dayStart), [dayStart]);
  const isToday = date === isoDateLocalToday();

  // NOW markers
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id); }, []);
  const isPastSlot = (slot: Date) => isToday && slot < now;
  const isNowRow = (slot: Date) => {
    if (!isToday) return false;
    const next = new Date(slot.getTime() + MIN_PER_SLOT * 60 * 1000);
    return slot <= now && now < next;
  };

  // Tables
  const [tables, setTables] = useState<TableInfo[]>([]);
  useEffect(() => {
    if (!slug) return;
    const fromUrl = parseTablesFromURL(search);
    const defaults = ["seed-table-1", "seed-table-2", "seed-table-3", "seed-table-4"];
    (async () => {
      try {
        const res = await fetch(`/api/tables?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const list = data?.tables ?? [];
          if (Array.isArray(list) && list.length) {
            if (typeof list[0] === "string") { setTables(list.map((id: string) => ({ id, label: id }))); return; }
            setTables(list as TableInfo[]); return;
          }
        }
      } catch {}
      if (fromUrl.length) { setTables(fromUrl.map(id => ({ id, label: id }))); return; }
      setTables(defaults.map(id => ({ id, label: id })));
    })();
  }, [slug, search]);
  const labelFor = useMemo(() => Object.fromEntries(tables.map(t => [t.id, t.label ?? t.id])), [tables]);

  // Tiles status + day items
  const [grid, setGrid] = useState<Record<string, Tile>>({});
  const [allItems, setAllItems] = useState<ScheduleItem[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [needsActionCount, setNeedsActionCount] = useState(0);

  async function fetchDayAll() {
    if (!pinReady || !tables.length || !slug || !date) return;
    setLoadingDay(true);
    try {
      const ids = tables.map(t => t.id);
      const res = await fetch(
        `/api/schedule/all?slug=${encodeURIComponent(slug)}&date=${date}&tables=${encodeURIComponent(ids.join(","))}`,
        { headers: { "x-host-pin": pin }, cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json() as { items?: ScheduleItem[] };
        const items = data.items || [];
        setAllItems(items);

        // Count overdue (past end, still pending) — visual nudge only
        const nowLocal = new Date();
        const needAct = items.filter(it =>
          it.type !== "session" &&
          it.status !== "NO_SHOW" &&
          it.status !== "CANCELLED" &&
          toDate(it.endAt) < nowLocal
        ).length;
        setNeedsActionCount(needAct);
      }
    } finally { setLoadingDay(false); }
  }

  async function refreshTiles() {
    if (!pinReady || !tables.length || !slug) return;
    const ids = tables.map(t => t.id);
    const res = await fetch(
      `/api/schedule/all?slug=${encodeURIComponent(slug)}&date=${date}&tables=${encodeURIComponent(ids.join(","))}`,
      { headers: { "x-host-pin": pin }, cache: "no-store" }
    );
    if (!res.ok) return;
    const data = await res.json() as { items?: ScheduleItem[] };
    const nowLocal = new Date();
    const items = data.items || [];
    const updates: Record<string, Tile> = {};
    for (const t of tables) {
      const tableItems = items.filter(i => i.tableId === t.id).sort((a, b) => +toDate(a.startAt) - +toDate(b.startAt));
      let live = false, liveUntil: Date | undefined, nextStart: Date | undefined;
      for (const s of tableItems) {
        const st = toDate(s.startAt), en = toDate(s.endAt);
        if (st <= nowLocal && nowLocal < en) { live = true; liveUntil = en; break; }
        if (!live && !nextStart && st > nowLocal) nextStart = st;
      }
      updates[t.id] = { tableId: t.id, live, liveUntil, nextStart, loading: false };
    }
    setGrid(prev => ({ ...prev, ...updates }));
  }

  useEffect(() => {
    if (!pinReady || !tables.length) return;
    const init: Record<string, Tile> = {};
    tables.forEach(t => (init[t.id] = { tableId: t.id, live: false, loading: true }));
    setGrid(init);
    fetchDayAll(); refreshTiles();
    const id = setInterval(() => { fetchDayAll(); refreshTiles(); setNow(new Date()); }, 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinReady, tables, date]);

  // Intervals per table
  const intervalsByTable = useMemo(() => {
    const by: Record<string, { start: Date; end: Date; kind: "booking" | "live"; item: ScheduleItem }[]> = {};
    for (const t of tables) by[t.id] = [];
    for (const it of allItems) {
      const s = toDate(it.startAt), e = toDate(it.endAt);
      const kind: "booking" | "live" = it.type === "session" ? "live" : "booking";
      (by[it.tableId] ||= []).push({ start: s, end: e, kind, item: it });
    }
    for (const k of Object.keys(by)) by[k].sort((a, b) => +a.start - +b.start);
    return by;
  }, [allItems, tables]);

  // 🔑 Prefer LIVE over BOOKED when overlapping
  const cellKind = (tableId: string, slot: Date): "free" | "booking" | "live" => {
    const ivals = intervalsByTable[tableId] || [];
    let hasBooking = false;
    for (const iv of ivals) {
      if (iv.start <= slot && slot < iv.end) {
        if (iv.kind === "live") return "live";
        hasBooking = true;
      }
    }
    return hasBooking ? "booking" : "free";
  };

  const findItemAt = (tableId: string, slot: Date): ScheduleItem | null => {
    const ivals = intervalsByTable[tableId] || [];
    let booking: ScheduleItem | null = null;
    for (const iv of ivals) {
      if (iv.start <= slot && slot < iv.end) {
        if (iv.kind === "live") return iv.item;   // prefer session
        if (!booking) booking = iv.item;          // otherwise keep first booking
      }
    }
    return booking;
  };

  // Create booking modal
  type DraftBooking = {
    open: boolean; tableId: string | null; startAtISO: string; endAtISO: string;
    partyName: string; notes: string; saving: boolean; error: string;
  };
  const [draft, setDraft] = useState<DraftBooking>({
    open: false, tableId: null, startAtISO: "", endAtISO: "", partyName: "", notes: "", saving: false, error: "",
  });
  function openCreateModal(tableId: string, slot: Date) {
    if (isPastSlot(slot)) return;
    const s = roundTo15(slot, "down");
    const safeStart = isToday && s < now ? roundTo15(now, "up") : s;
    const e = roundTo15(new Date(safeStart.getTime() + 60 * 60 * 1000), "up");
    setDraft({ open: true, tableId, startAtISO: safeStart.toISOString(), endAtISO: e.toISOString(), partyName: "", notes: "", saving: false, error: "" });
  }
  const closeCreateModal = () => setDraft(p => ({ ...p, open: false, error: "" }));
  const updateDuration = (min: number) => {
    const s = new Date(draft.startAtISO); const e = new Date(s.getTime() + min * 60 * 1000);
    setDraft(p => ({ ...p, endAtISO: e.toISOString() }));
  };
  async function saveBooking() {
    if (!draft.tableId) return;
    if (new Date(draft.startAtISO) < new Date()) { setDraft(p => ({ ...p, error: "Start time must be in the future" })); return; }
    setDraft(p => ({ ...p, saving: true, error: "" }));
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-host-pin": pin },
        body: JSON.stringify({
          slug, tableId: draft.tableId, startAt: draft.startAtISO, endAt: draft.endAtISO,
          partyName: draft.partyName || null, notes: draft.notes || null,
        }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || "Failed to create booking"); }
      await fetchDayAll(); await refreshTiles(); closeCreateModal();
    } catch (e: any) { setDraft(p => ({ ...p, error: e?.message || "Failed to save" })); }
    finally { setDraft(p => ({ ...p, saving: false })); }
  }

  // Details modal
  type DetailsState = { open: boolean; item: ScheduleItem | null; tableLabel?: string; tag?: "ARRIVED" | "NO-SHOW" | "DUE" | "" };
  const [details, setDetails] = useState<DetailsState>({ open: false, item: null });

  function deriveBookingTag(it: ScheduleItem): "ARRIVED" | "NO-SHOW" | "DUE" | "" {
    if ((it as any).status === "ARRIVED") return "ARRIVED";
    if ((it as any).status === "NO_SHOW") return "NO-SHOW";
    if ((it as any).status === "CANCELLED") return "";
    // Only show DUE (in-progress pending). We no longer infer ARRIVED by overlap,
    // since LIVE now renders on top when overlapping.
    const s = toDate(it.startAt), e = toDate(it.endAt), n = new Date();
    if (s <= n && n < e) return "DUE";
    return "";
  }

  const openDetailsModal = (item: ScheduleItem) =>
    setDetails({
      open: true,
      item,
      tableLabel: labelFor[item.tableId] || item.tableId,
      tag: item.type === "booking" ? deriveBookingTag(item) : "",
    });
  const closeDetailsModal = () => setDetails({ open: false, item: null });

  function itemDuration(it: ScheduleItem): string {
    const mins = Math.max(0, Math.round((+toDate(it.endAt) - +toDate(it.startAt)) / 60000));
    if (mins < 60) return `${mins}m`; const h = Math.floor(mins / 60), m = mins % 60; return m ? `${h}h ${m}m` : `${h}h`;
  }

  const [recentlyArrived, setRecentlyArrived] = useState<Set<string>>(new Set());
  function flashArrived(id: string) {
    setRecentlyArrived(prev => new Set(prev).add(id));
    setTimeout(() => {
      setRecentlyArrived(prev => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }, 1800);
  }

  // Actions: Arrived / No-show / Seat Now
  async function markBookingArrived(bookingId: string) {
    try {
      const res = await fetch("/api/bookings/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-host-pin": pin },
        body: JSON.stringify({ slug, bookingId, status: "ARRIVED" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (res.status === 404 || res.status === 400) {
          alert("‘Mark Arrived’ needs booking_status + /api/bookings/status. ‘Seat Now’ still works.");
          return;
        }
        throw new Error(j?.error || "Failed to mark arrived");
      }
      flashArrived(bookingId);
      await fetchDayAll(); await refreshTiles();
      closeDetailsModal();
    } catch (e: any) {
      alert(e?.message || "Failed to mark arrived");
    }
  }

  async function markBookingNoShow(bookingId: string) {
    try {
      const res = await fetch("/api/bookings/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-host-pin": pin },
        body: JSON.stringify({ slug, bookingId, status: "NO_SHOW" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Failed to mark no-show");
      }
      await fetchDayAll(); await refreshTiles();
      closeDetailsModal();
    } catch (e: any) {
      alert(e?.message || "Failed to mark no-show");
    }
  }

  async function seatBookingNow(item: ScheduleItem) {
    const start = roundTo15(new Date(), "up");
    const end = new Date(item.endAt);
    if (start >= end) { alert("This booking ends too soon to start a session."); return; }
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-host-pin": pin },
      body: JSON.stringify({
        slug,
        tableId: item.tableId,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        partyName: item.partyName || "Arrived",
        source: "master-seat-now",
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j?.error || "Failed to start session");
      return;
    }
    flashArrived(item.id);
    await fetchDayAll(); await refreshTiles();
    closeDetailsModal();
  }

  function gotoControl(tableId: string) {
    setLeaving(true);
    window.location.href = `/p/${encodeURIComponent(slug)}/host#${encodeURIComponent(tableId)}`;
  }

  // ----- Render -----
  return (
    <div className="min-h-dvh bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="text-lg font-semibold">{slug} · Master Schedule</div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-2xl overflow-hidden border border-white/20">
              <button type="button" onClick={() => setView("day")} className={`px-3 py-2 text-sm ${view === "day" ? "bg-white text-black" : "bg-white/10 text-white/80 hover:bg-white/15"}`}>Day View</button>
              <button type="button" onClick={() => setView("tiles")} className={`px-3 py-2 text-sm ${view === "tiles" ? "bg-white text-black" : "bg-white/10 text-white/80 hover:bg-white/15"}`}>Tiles</button>
            </div>

            {/* Date controls */}
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setDate(prev => {
                const d = new Date(localDayStart(prev)); d.setDate(d.getDate() - 1);
                return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
              })} className="px-3 py-2 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15 text-sm">◀ Prev</button>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 rounded-2xl bg-white/10 border border-white/20 text-sm" />
              <button type="button" onClick={() => setDate(prev => {
                const d = new Date(localDayStart(prev)); d.setDate(d.getDate() + 1);
                return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
              })} className="px-3 py-2 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15 text-sm">Next ▶</button>
            </div>

            {/* Tables nav */}
            <button
              type="button"
              onClick={() => { setLeaving(true); window.location.href = `/p/${encodeURIComponent(slug)}/host`; }}
              className="rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-semibold text-base shadow-md transition px-6 py-3"
            >
              {leaving ? "Opening…" : "Tables"}
            </button>
          </div>
        </div>

        {/* Needs action banner (manual only) */}
        {pinReady && needsActionCount > 0 && (
          <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50/10 text-amber-200 px-4 py-3 text-sm">
            {needsActionCount} booking{needsActionCount > 1 ? "s" : ""} need action (past end, still pending). Use “No-show” to close them.
          </div>
        )}

        {/* Loading / PIN gate */}
        {loading && <div className="text-center text-white/60"><div className="text-lg">Loading...</div></div>}
        {!loading && !pinReady && (
          <div className="text-center mb-6">
            <div className="text-red-400 mb-4">No PIN found. Please authenticate via Host Controls first.</div>
            <a href={`/p/${encodeURIComponent(slug)}/host`} className="inline-block text-sm px-4 py-2 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15">Go to Host Controls</a>
          </div>
        )}

        {/* Day View */}
        {!loading && pinReady && view === "day" && (
          <div className="w-full overflow-auto rounded-2xl border border-white/10">
            <div className="grid" style={{ gridTemplateColumns: `120px repeat(${tables.length}, minmax(180px, 1fr))` }}>
              {/* Headers */}
              <div className="sticky top-0 z-10 bg-black/80 backdrop-blur px-3 py-2 border-b border-white/10 text-white/70 text-xs">Time</div>
              {tables.map((t) => (
                <div key={`th-${t.id}`} className="sticky top-0 z-10 bg-black/80 backdrop-blur px-3 py-2 border-b border-white/10 text-center">
                  <div className="text-sm font-semibold">{labelFor[t.id] || t.id}</div>
                </div>
              ))}

              {/* Rows */}
              {daySlots.map((slot, idx) => {
                const hh = String(slot.getHours()).padStart(2, "0");
                const mm = String(slot.getMinutes()).padStart(2, "0");
                const stripe = slot.getMinutes() === 0 ? "bg-white/5" : "bg-transparent";
                const nowRow = isNowRow(slot);
                const timeCellExtra = nowRow ? "ring-2 ring-emerald-400/70 rounded" : "";
                return (
                  <React.Fragment key={`row-${idx}`}>
                    <div id={nowRow ? "now-row-anchor" : undefined} className={`px-3 py-2 border-b border-white/10 text-xs text-white/70 flex items-center justify-between ${stripe} ${timeCellExtra}`}>
                      <span>{hh}:{mm}</span>
                      {nowRow && <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-emerald-500/90 text-white">NOW</span>}
                    </div>

                    {tables.map((t) => {
                      const kind = cellKind(t.id, slot);
                      const item = kind === "free" ? null : findItemAt(t.id, slot);
                      const isFree = kind === "free";
                      const isPast = isPastSlot(slot);
                      const disabled = isFree && isPast;
                      const pastDim = isPast ? "opacity-50" : "";
                      const nowOutline = nowRow ? "ring-2 ring-emerald-400/50" : "";

                      // Manual overdue (past end, not NO_SHOW/CANCELLED)
                      const isBooking = !!item && item.type !== "session";
                      const overdue = isBooking && toDate(item!.endAt) < new Date() && item?.status !== "NO_SHOW" && item?.status !== "CANCELLED";
                      const overdueRing = overdue ? "ring-2 ring-red-300" : "";

                      let label = "FREE";
                      if (!isFree) {
                        if (kind === "live") {
                          label = item?.partyName ? `LIVE — ${item.partyName}` : "LIVE";
                        } else {
                          const tag = item ? deriveBookingTag(item) : "";
                          const base = item?.partyName ? item.partyName : "";
                          if (tag === "ARRIVED") label = base ? `ARRIVED — ${base}` : "ARRIVED";
                          else if (tag === "NO-SHOW") label = base ? `NO-SHOW — ${base}` : "NO-SHOW";
                          else if (tag === "DUE") label = base ? `BOOKED — ${base}` : "BOOKED";
                          else label = base ? `BOOKED — ${base}` : "BOOKED";
                        }
                      } else if (isPast) label = "PAST";

                      const onClick = () => {
                        if (isFree) {
                          if (!isPast) openCreateModal(t.id, slot);
                        } else if (item) {
                          openDetailsModal(item);
                        }
                      };

                      const arrivedPulse =
                        item &&
                        item.type !== "session" &&
                        (item.status === "ARRIVED" || deriveBookingTag(item) === "ARRIVED");

                      return (
                        <div key={`cellwrap-${idx}-${t.id}`} className={`relative`}>
                          <button
                            key={`cell-${idx}-${t.id}`}
                            type="button"
                            onClick={onClick}
                            disabled={disabled}
                            className={`w-full px-2 py-2 border-b border-white/10 text-center text-xs ${cellClass(kind, item?.status)} ${pastDim} ${nowOutline} ${arrivedPulse ? "animate-pulse" : ""} ${overdueRing} ${isFree && !isPast ? "hover:opacity-80" : !isFree ? "hover:opacity-90" : "cursor-default"}`}
                            title={
                              item
                                ? `${labelFor[t.id] || t.id} — ${fmtHM(toDate(item.startAt))}–${fmtHM(toDate(item.endAt))} ${item.type === "session" ? "(live)" : "(booked)"}`
                                : `${labelFor[t.id] || t.id} — ${hh}:${mm} ${isPast ? "(past)" : "(free)"}`
                            }
                          >
                            <div className="truncate">{label}</div>
                            {overdue && (
                              <div className="mt-1">
                                <span className="text-[10px] px-2 py-0.5 rounded bg-red-600 text-white">Overdue</span>
                              </div>
                            )}
                          </button>

                          {overdue && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (item) markBookingNoShow(item.id);
                              }}
                              className="absolute right-1 top-1 text-[10px] px-2 py-0.5 rounded bg-amber-700 hover:bg-amber-800 text-white shadow"
                              title="Mark this booking as NO-SHOW"
                            >
                              Mark No-show
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>

            <div className="flex items-center justify-between px-3 py-2 text-[11px] text-white/50 border-t border-white/10 bg-black/50">
              <div className="flex flex-wrap items-center gap-2">
                <span>Legend:</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/90 text-white">LIVE</span>
                <span className="px-2 py-0.5 rounded bg-amber-300 text-black">BOOKED</span>
                <span className="px-2 py-0.5 rounded bg-sky-400/80 text-black">ARRIVED</span>
                <span className="px-2 py-0.5 rounded bg-amber-300 text-black">DUE</span>
                <span className="px-2 py-0.5 rounded bg-gray-400/60 text-black">NO-SHOW</span>
                <span className="px-2 py-0.5 rounded bg-white text-black">FREE</span>
                <span className="px-2 py-0.5 rounded bg-white/40 text-black">PAST</span>
              </div>
              <div>{loadingDay ? "Updating…" : "Auto-refresh every 30s"}</div>
            </div>
          </div>
        )}

        {/* Tiles View */}
        {!loading && pinReady && view === "tiles" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {tables.map((table) => {
                const tile = grid[table.id];
                const isLive = tile?.live;
                const liveLine = isLive ? `Live until ${tile?.liveUntil ? fmtHM(tile.liveUntil) : "—"}` : "Free";
                const nextLine = !isLive ? (tile?.nextStart ? `Next ${fmtHM(tile.nextStart)}` : "No more today") : "";
                return (
                  <button
                    key={table.id}
                    onClick={() => gotoControl(table.id)}
                    className={`aspect-[2/1] rounded-2xl p-3 flex flex-col items-center justify-center ${isLive ? "bg-emerald-500/90 text-white" : "bg-white text-black"}`}
                  >
                    <div className="text-2xl font-bold">{table.label || table.id}</div>
                    <div className={`text-sm ${isLive ? "text-white" : "text-black/70"}`}>{tile?.loading ? "…" : liveLine}</div>
                    {!isLive && <div className="text-xs text-black/50">{tile?.loading ? "" : nextLine}</div>}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button onClick={() => { fetchDayAll(); refreshTiles(); }} className="text-xs underline underline-offset-4 text-white/70 hover:text-white">Refresh</button>
              <div className="text-[11px] text-white/40">Auto-refresh every 30s</div>
            </div>
          </>
        )}

        {/* Booking Modal (Create) */}
        {draft.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={closeCreateModal} />
            <div className="relative w-full max-w-md bg-slate-900 rounded-2xl border border-white/10 p-5">
              <div className="text-lg font-semibold mb-3">Create Booking</div>
              <div className="space-y-3">
                <div className="text-sm text-white/70">Table: <span className="font-semibold text-white">{draft.tableId && (labelFor[draft.tableId] || draft.tableId)}</span></div>

                <label className="block text-sm">
                  <span className="text-white/70">Start</span>
                  <input type="datetime-local" value={new Date(draft.startAtISO).toISOString().slice(0,16)} onChange={(e) => setDraft(p => ({ ...p, startAtISO: new Date(e.target.value).toISOString() }))} step={900} className="mt-1 w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2" />
                </label>

                <label className="block text-sm">
                  <span className="text-white/70">End</span>
                  <input type="datetime-local" value={new Date(draft.endAtISO).toISOString().slice(0,16)} onChange={(e) => setDraft(p => ({ ...p, endAtISO: new Date(e.target.value).toISOString() }))} step={900} className="mt-1 w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2" />
                </label>

                <div className="flex gap-2">
                  {[30,45,60,90,120].map(m => (
                    <button key={m} type="button" onClick={() => updateDuration(m)} className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/15 text-sm">
                      +{m}m
                    </button>
                  ))}
                </div>

                <label className="block text-sm">
                  <span className="text-white/70">Name (optional)</span>
                  <input type="text" value={draft.partyName} onChange={(e) => setDraft(p => ({ ...p, partyName: e.target.value }))} className="mt-1 w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2" placeholder="Party name" />
                </label>

                <label className="block text_sm">
                  <span className="text-white/70">Notes (optional)</span>
                  <textarea value={draft.notes} onChange={(e) => setDraft(p => ({ ...p, notes: e.target.value }))} className="mt-1 w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2" rows={3} placeholder="Any special notes" />
                </label>

                {draft.error && <div className="text-sm text-red-400">{draft.error}</div>}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button type="button" onClick={closeCreateModal} className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15 text-sm" disabled={draft.saving}>Cancel</button>
                  <button type="button" onClick={saveBooking} disabled={draft.saving} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm">
                    {draft.saving ? "Saving…" : "Save Booking"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Details Modal */}
        {details.open && details.item && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={closeDetailsModal} />
            <div className="relative w-full max-w-md bg-slate-900 rounded-2xl border border-white/10 p-5">
              <div className="text-lg font-semibold mb-1">Details</div>
              <div className="text-xs text-white/60 mb-4">{details.item.type === "session" ? "Live session" : "Booking"}</div>

              <div className="space-y-2 text-sm">
                <div><span className="text-white/60">Table:</span> <span className="font-semibold">{details.tableLabel}</span></div>
                <div><span className="text-white/60">Time:</span> <span className="font-semibold">{fmtHM(toDate(details.item.startAt))} – {fmtHM(toDate(details.item.endAt))}</span> <span className="text-white/40">({itemDuration(details.item)})</span></div>
                {details.tag && details.item.type === "booking" && (
                  <div><span className="text-white/60">Status:</span> <span className="font-semibold">{details.tag}</span></div>
                )}
                {details.item.partyName && (<div><span className="text-white/60">Name:</span> <span className="font-semibold">{details.item.partyName}</span></div>)}
                {details.item.notes && (<div><span className="text-white/60">Notes:</span> <span className="font-semibold">{details.item.notes}</span></div>)}
                {!details.item.partyName && details.item.type === "session" && (<div className="text-white/60">Walk-in / live</div>)}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 mt-4">
                {details.item.type === "booking" && (
                  <>
                    <button
                      type="button"
                      onClick={() => markBookingArrived(details.item!.id)}
                      className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-semibold text-sm"
                      title="Mark booking as arrived (turns light blue)"
                    >
                      Mark Arrived
                    </button>

                    <button
                      type="button"
                      onClick={() => seatBookingNow(details.item!)}
                      className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm"
                      title="Start the live session now, ending at the booking end"
                    >
                      Seat Now
                    </button>

                    {toDate(details.item.endAt) < new Date() && details.item.status !== "NO_SHOW" && details.item.status !== "CANCELLED" && (
                      <button
                        type="button"
                        onClick={() => markBookingNoShow(details.item!.id)}
                        className="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-semibold text-sm"
                        title="Mark as NO-SHOW"
                      >
                        Mark No-show
                      </button>
                    )}
                  </>
                )}

                {details.item.type === "session" && (
                  <a
                    href={`/p/${encodeURIComponent(slug)}/host#${encodeURIComponent(details.item.tableId)}`}
                    className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15 text-sm"
                  >
                    Open Table
                  </a>
                )}

                <button type="button" onClick={closeDetailsModal} className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15 text-sm">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
