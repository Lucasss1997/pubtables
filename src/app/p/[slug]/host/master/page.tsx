// src/app/p/[slug]/host/master/page.tsx
"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type ScheduleItem = {
  id: string;
  tableId: string;
  startAt: string; // ISO
  endAt: string;   // ISO
  partyName?: string | null;
  notes?: string | null;
  type?: "booking" | "session";
  status?: "ACTIVE" | "ARRIVED" | "NO_SHOW" | "CANCELLED" | "COMPLETED";
};

type TableInfo = { id: string; label?: string };
type Tile = {
  tableId: string;
  live: boolean;
  liveUntil?: Date;
  nextStart?: Date;
  loading: boolean;
};

const MIN_PER_SLOT = 15;
const SLOT_MS = MIN_PER_SLOT * 60 * 1000;
const SLOTS_PER_DAY = 24 * (60 / MIN_PER_SLOT);

const toDate = (iso: string) => new Date(iso);
const fmtHM = (d: Date) =>
  d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function isoDateLocalToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function localDayStart(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}
function buildSlots(dayStart: Date): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < SLOTS_PER_DAY; i++) {
    out.push(new Date(dayStart.getTime() + i * SLOT_MS));
  }
  return out;
}
function parseTablesFromURL(search: URLSearchParams | null) {
  if (!search) return [] as string[];
  const raw = search.getAll("tables");
  if (!raw.length) return [];
  const out: string[] = [];
  for (const r of raw) {
    r.split(",").forEach((s) => {
      const t = s.trim();
      if (t) out.push(t);
    });
  }
  return out;
}

function cellClass(kind: "free" | "booking" | "live", status?: string) {
  if (kind === "live") return "bg-emerald-500/90 text-white";
  if (kind === "booking") {
    if (status === "ARRIVED") return "bg-sky-400/80 text-black";
    if (status === "NO_SHOW") return "bg-gray-400/60 text-black";
    if (status === "COMPLETED") return "bg-emerald-300 text-black";
    return "bg-amber-300 text-black";
  }
  return "bg-white text-black";
}
function roundTo15(d: Date, dir: "down" | "up" = "down") {
  const t = d.getTime();
  return new Date(
    (dir === "down" ? Math.floor(t / SLOT_MS) : Math.ceil(t / SLOT_MS)) *
      SLOT_MS
  );
}

const sanitizePin = (raw: string) => (raw || "").replace(/\D/g, "").slice(0, 6);
const isPin = (p: string) => /^\d{6}$/.test(p);

type DraftBooking = {
  open: boolean;
  tableId: string | null;
  startAtISO: string;
  endAtISO: string;
  partyName: string;
  notes: string;
  saving: boolean;
  error: string;
};

export default function MasterSchedule() {
  const { slug } = useParams<{ slug: string }>();
  const search = useSearchParams();

  const [view, setView] = useState<"day" | "tiles">("day");

  // PIN
  const [pin, setPin] = useState("");
  const [pinReady, setPinReady] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    try {
      const a = sessionStorage.getItem("host_pin") || "";
      const b = sessionStorage.getItem("hostPin") || "";
      const p = sanitizePin(a || b);
      if (isPin(p)) {
        setPin(p);
        setPinReady(true);
      } else {
        sessionStorage.removeItem("host_pin");
        sessionStorage.removeItem("hostPin");
      }
    } catch {}
    const t = setTimeout(() => setLoading(false), 60);
    return () => clearTimeout(t);
  }, []);

  // Date & NOW
  const [date, setDate] = useState<string>(isoDateLocalToday());
  const dayStart = useMemo(() => localDayStart(date), [date]);
  const daySlots = useMemo(() => buildSlots(dayStart), [dayStart]);

  const todayStart = localDayStart(isoDateLocalToday());
  const isPastDay = dayStart.getTime() < todayStart.getTime();
  const isFutureDay = dayStart.getTime() > todayStart.getTime();
  const isToday = !isPastDay && !isFutureDay;

  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // For disabling action on cells: past day is blocked; today earlier slots are clickable (we’ll bump to now)
  const isPastSlot = (slot: Date) => {
    if (isFutureDay) return false;
    if (isPastDay) return true;
    return slot < now;
  };
  const isNowRow = (slot: Date) =>
    isToday && slot <= now && now < new Date(slot.getTime() + SLOT_MS);

  // Auto-scroll to NOW row on open (for today/day view)
  const scrollOnceRef = useRef(false);
  useEffect(() => {
    if (scrollOnceRef.current) return;
    if (!pinReady || loading || view !== "day" || !isToday) return;
    scrollOnceRef.current = true;
    // small delay to ensure DOM rows are painted
    const t = setTimeout(() => {
      const anchor = document.getElementById("now-row-anchor");
      if (anchor) anchor.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 30);
    return () => clearTimeout(t);
  }, [pinReady, loading, view, isToday]);

  // Go to Today action
  const goToToday = () => {
    setDate(isoDateLocalToday());
    setView("day");
    // allow the scroll effect to run again
    scrollOnceRef.current = false;
  };

  // --- Calendar (persistent) ---
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const openCalendar = () => {
    // Chrome/Edge support showPicker; fallback to focus otherwise.
    (dateInputRef.current as any)?.showPicker?.();
    dateInputRef.current?.focus();
  };

  // Tables
  const [tables, setTables] = useState<TableInfo[]>([]);
  useEffect(() => {
    if (!slug) return;
    const fromUrl = parseTablesFromURL(search);
    const defaults = [
      "seed-table-1",
      "seed-table-2",
      "seed-table-3",
      "seed-table-4",
    ];
    (async () => {
      try {
        const res = await fetch(`/api/tables?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          const list = data?.tables ?? [];
          if (Array.isArray(list) && list.length) {
            if (typeof list[0] === "string") {
              setTables((list as string[]).map((id) => ({ id, label: id })));
              return;
            }
            setTables(list as TableInfo[]);
            return;
          }
        }
      } catch {}
      if (fromUrl.length) {
        setTables(fromUrl.map((id) => ({ id, label: id })));
        return;
      }
      setTables(defaults.map((id) => ({ id, label: id })));
    })();
  }, [slug, search]);

  const labelFor = useMemo(
    () => Object.fromEntries(tables.map((t) => [t.id, t.label ?? t.id])),
    [tables]
  );

  // Items / tiles data
  const [grid, setGrid] = useState<Record<string, Tile>>({});
  const [allItems, setAllItems] = useState<ScheduleItem[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);

  // Overdue helpers
  const [overdueIds, setOverdueIds] = useState<string[]>([]);
  const [currentOverdueIdx, setCurrentOverdueIdx] = useState<number>(0);
  const [flashId, setFlashId] = useState<string | null>(null);

  async function fetchDayAll() {
    if (!pinReady || !tables.length || !slug || !date) return;
    setLoadingDay(true);
    try {
      const ids = tables.map((t) => t.id);
      const res = await fetch(
        `/api/schedule/all?slug=${encodeURIComponent(
          slug
        )}&date=${date}&tables=${encodeURIComponent(ids.join(","))}`,
        { headers: { "x-host-pin": pin }, cache: "no-store" }
      );
      if (res.ok) {
        const data = (await res.json()) as { items?: ScheduleItem[] };
        const items = data.items || [];
        setAllItems(items);

        // overdue: bookings that are past end & not closed
        const nowLocal = new Date();
        const pendings = items
          .filter((it) => {
            if (it.type === "session") return false;
            const st = it.status;
            if (st === "NO_SHOW" || st === "CANCELLED" || st === "COMPLETED")
              return false;
            return toDate(it.endAt) < nowLocal;
          })
          .sort((a, b) => +toDate(a.startAt) - +toDate(b.startAt));
        setOverdueIds(pendings.map((p) => p.id));
        setCurrentOverdueIdx((idx) =>
          Math.min(idx, Math.max(0, pendings.length - 1))
        );
      }
    } finally {
      setLoadingDay(false);
    }
  }

  async function refreshTiles() {
    if (!pinReady || !tables.length || !slug) return;
    const ids = tables.map((t) => t.id);
    const res = await fetch(
      `/api/schedule/all?slug=${encodeURIComponent(
        slug
      )}&date=${date}&tables=${encodeURIComponent(ids.join(","))}`,
      { headers: { "x-host-pin": pin }, cache: "no-store" }
    );
    if (!res.ok) return;
    const data = (await res.json()) as { items?: ScheduleItem[] };
    const nowLocal = new Date();
    const items = data.items || [];
    const updates: Record<string, Tile> = {};
    for (const t of tables) {
      const tableItems = items
        .filter((i) => i.tableId === t.id)
        .sort((a, b) => +toDate(a.startAt) - +toDate(b.startAt));
      let live = false,
        liveUntil: Date | undefined,
        nextStart: Date | undefined;
      for (const s of tableItems) {
        const st = toDate(s.startAt),
          en = toDate(s.endAt);
        if (st <= nowLocal && nowLocal < en) {
          live = true;
          liveUntil = en;
          break;
        }
        if (!live && !nextStart && st > nowLocal) nextStart = st;
      }
      updates[t.id] = { tableId: t.id, live, liveUntil, nextStart, loading: false };
    }
    setGrid((prev) => ({ ...prev, ...updates }));
  }

  useEffect(() => {
    if (!pinReady || !tables.length) return;
    const init: Record<string, Tile> = {};
    tables.forEach(
      (t) => (init[t.id] = { tableId: t.id, live: false, loading: true })
    );
    setGrid(init);
    fetchDayAll();
    refreshTiles();
    const id = setInterval(() => {
      fetchDayAll();
      refreshTiles();
      setNow(new Date());
    }, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinReady, tables, date]);

  // intervals per table (prefer LIVE on overlaps)
  const intervalsByTable = useMemo(() => {
    const by: Record<
      string,
      { start: Date; end: Date; kind: "booking" | "live"; item: ScheduleItem }[]
    > = {};
    for (const t of tables) by[t.id] = [];
    for (const it of allItems) {
      const s = toDate(it.startAt),
        e = toDate(it.endAt);
      const kind: "booking" | "live" = it.type === "session" ? "live" : "booking";
      (by[it.tableId] ||= []).push({ start: s, end: e, kind, item: it });
    }
    for (const k of Object.keys(by))
      by[k].sort((a, b) => +a.start - +b.start);
    return by;
  }, [allItems, tables]);

  const cellKind = (
    tableId: string,
    slot: Date
  ): "free" | "booking" | "live" => {
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
        if (iv.kind === "live") return iv.item; // prefer session
        if (!booking) booking = iv.item;
      }
    }
    return booking;
  };

  // Create booking modal state
  const [draft, setDraft] = useState<DraftBooking>({
    open: false,
    tableId: null,
    startAtISO: "",
    endAtISO: "",
    partyName: "",
    notes: "",
    saving: false,
    error: "",
  });

  function openCreateModal(tableId: string, slot: Date) {
    const s = roundTo15(slot, "down");
    // if it's earlier today, bump to now rounded up; past day is blocked at button level
    const safeStart = isToday && s < now ? roundTo15(now, "up") : s;
    const e = roundTo15(new Date(safeStart.getTime() + 60 * 60 * 1000), "up");
    setDraft({
      open: true,
      tableId,
      startAtISO: safeStart.toISOString(),
      endAtISO: e.toISOString(),
      partyName: "",
      notes: "",
      saving: false,
      error: "",
    });
  }
  const closeCreateModal = () =>
    setDraft((p) => ({ ...p, open: false, error: "" }));
  const updateDuration = (min: number) => {
    const s = new Date(draft.startAtISO);
    const e = new Date(s.getTime() + min * 60 * 1000);
    setDraft((p) => ({ ...p, endAtISO: e.toISOString() }));
  };
  async function saveBooking() {
    if (!draft.tableId) return;
    const start = new Date(draft.startAtISO);
    const end = new Date(draft.endAtISO);
    if (!(start < end)) {
      setDraft((p) => ({ ...p, error: "End must be after start" }));
      return;
    }
    setDraft((p) => ({ ...p, saving: true, error: "" }));
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-host-pin": pin },
        body: JSON.stringify({
          slug,
          tableId: draft.tableId,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          partyName: draft.partyName || null,
          notes: draft.notes || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Failed to create booking");
      }
      await fetchDayAll();
      await refreshTiles();
      closeCreateModal();
    } catch (e: any) {
      setDraft((p) => ({ ...p, error: e?.message || "Failed to save" }));
    } finally {
      setDraft((p) => ({ ...p, saving: false }));
    }
  }

  // Details modal
  type DetailsState = {
    open: boolean;
    item: ScheduleItem | null;
    tableLabel?: string;
    tag?: "ARRIVED" | "NO-SHOW" | "DUE" | "";
  };
  const [details, setDetails] = useState<DetailsState>({ open: false, item: null });

  function deriveBookingTag(it: ScheduleItem): "ARRIVED" | "NO-SHOW" | "DUE" | "" {
    const st = it.status;
    if (st === "ARRIVED") return "ARRIVED";
    if (st === "NO_SHOW") return "NO-SHOW";
    if (st === "CANCELLED" || st === "COMPLETED") return "";
    const s = toDate(it.startAt),
      e = toDate(it.endAt),
      n = new Date();
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
    const mins = Math.max(
      0,
      Math.round((+toDate(it.endAt) - +toDate(it.startAt)) / 60000)
    );
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60),
      m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  // Actions
  async function setBookingStatus(
    bookingId: string,
    status: "ARRIVED" | "NO_SHOW" | "CANCELLED" | "COMPLETED"
  ) {
    const res = await fetch("/api/bookings/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-host-pin": pin },
      body: JSON.stringify({ slug, bookingId, status }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j?.error || "Failed to update booking");
      return;
    }
    await fetchDayAll();
    await refreshTiles();
    if (overdueIds.length) {
      const idx = Math.min(currentOverdueIdx, overdueIds.length - 1);
      setTimeout(() => scrollToOverdueByIndex(idx), 0);
    }
    closeDetailsModal();
  }
  const markBookingArrived = (id: string) => setBookingStatus(id, "ARRIVED");
  const markBookingNoShow = (id: string) => setBookingStatus(id, "NO_SHOW");
  const markBookingCompleted = (id: string) =>
    setBookingStatus(id, "COMPLETED");

  async function deleteBooking(item: ScheduleItem) {
    if (!confirm("Delete this booking?")) return;
    const res = await fetch(
      `/api/bookings/${encodeURIComponent(item.id)}?slug=${encodeURIComponent(
        String(slug)
      )}`,
      {
        method: "DELETE",
        headers: { "x-host-pin": pin },
      }
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j?.error || "Failed to delete booking");
      return;
    }
    await fetchDayAll();
    await refreshTiles();
    closeDetailsModal();
  }

  async function seatBookingNow(item: ScheduleItem) {
    const start = roundTo15(new Date(), "up");
    const end = new Date(item.endAt);
    if (start >= end) {
      alert("This booking ends too soon to start a session.");
      return;
    }
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
    await fetchDayAll();
    await refreshTiles();
    closeDetailsModal();
  }

  // Overdue navigation helpers
  function scrollToOverdueByIndex(idx: number) {
    if (idx < 0 || idx >= overdueIds.length) return;
    const id = overdueIds[idx];
    const el = document.getElementById(`overdue-${id}`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setCurrentOverdueIdx(idx);
      setFlashId(id);
      setTimeout(() => {
        setFlashId((prev) => (prev === id ? null : prev));
      }, 2000);
    }
  }
  const goFirstOverdue = () => scrollToOverdueByIndex(0);
  const goPrevOverdue = () =>
    scrollToOverdueByIndex(Math.max(0, currentOverdueIdx - 1));
  const goNextOverdue = () =>
    scrollToOverdueByIndex(Math.min(overdueIds.length - 1, currentOverdueIdx + 1));

  // ----- Render -----
  return (
    <div className="min-h-dvh bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="text-lg font-semibold">{slug} · Master Schedule</div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-2xl overflow-hidden border border-white/20">
              <button
                type="button"
                onClick={() => setView("day")}
                className={`px-3 py-2 text-sm ${
                  view === "day"
                    ? "bg-white text-black"
                    : "bg-white/10 text-white/80 hover:bg-white/15"
                }`}
              >
                Day View
              </button>
              <button
                type="button"
                onClick={() => setView("tiles")}
                className={`px-3 py-2 text-sm ${
                  view === "tiles"
                    ? "bg-white text-black"
                    : "bg-white/10 text-white/80 hover:bg-white/15"
                }`}
              >
                Tiles
              </button>
            </div>

            {/* Date controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setDate((prev) => {
                    const d = new Date(localDayStart(prev));
                    d.setDate(d.getDate() - 1);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
                      2,
                      "0"
                    )}-${String(d.getDate()).padStart(2, "0")}`;
                  })
                }
                className="px-3 py-2 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15 text-sm"
              >
                ◀ Prev
              </button>

              <input
                ref={dateInputRef}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 rounded-2xl bg-white/10 border border-white/20 text-sm"
              />

              {/* calendar opener */}
              <button
                type="button"
                onClick={openCalendar}
                className="px-3 py-2 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15 text-sm"
                title="Open calendar"
              >
                📅
              </button>

              <button
                type="button"
                onClick={() =>
                  setDate((prev) => {
                    const d = new Date(localDayStart(prev));
                    d.setDate(d.getDate() + 1);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
                      2,
                      "0"
                    )}-${String(d.getDate()).padStart(2, "0")}`;
                  })
                }
                className="px-3 py-2 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15 text-sm"
              >
                Next ▶
              </button>

              {/* Go to Today */}
              <button
                type="button"
                onClick={goToToday}
                className="px-3 py-2 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm"
                title="Jump to today's date and scroll to current time"
              >
                Today
              </button>
            </div>

            {/* Tables nav - plain link */}
            <a
              href={`/p/${encodeURIComponent(slug)}/host`}
              className="rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-semibold text-base shadow-md transition px-6 py-3"
              aria-label="Open Host Controls"
            >
              Tables
            </a>
          </div>
        </div>

        {/* Needs action banner */}
        {pinReady && overdueIds.length > 0 && (
          <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50/10 text-amber-200 px-4 py-3 text-sm flex items-center justify-between">
            <div>
              {overdueIds.length} booking{overdueIds.length > 1 ? "s" : ""} need
              action (past end, still pending). Use{" "}
              <span className="font-semibold">No-show</span> or{" "}
              <span className="font-semibold">Completed</span>.
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => goFirstOverdue()}
                className="px-3 py-1 rounded-lg bg-amber-400/20 border border-amber-300 text-amber-100 hover:bg-amber-400/30 text-xs"
              >
                Show
              </button>
              <button
                onClick={goPrevOverdue}
                disabled={currentOverdueIdx === 0}
                className="px-3 py-1 rounded-lg bg-amber-400/10 border border-amber-300/60 text-amber-200/80 disabled:opacity-40 text-xs"
              >
                Prev
              </button>
              <button
                onClick={goNextOverdue}
                disabled={currentOverdueIdx >= overdueIds.length - 1}
                className="px-3 py-1 rounded-lg bg-amber-400/10 border border-amber-300/60 text-amber-200/80 disabled:opacity-40 text-xs"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Loading / PIN gate */}
        {loading && (
          <div className="text-center text-white/60">
            <div className="text-lg">Loading...</div>
          </div>
        )}
        {!loading && !pinReady && (
          <div className="text-center mb-6">
            <div className="text-red-400 mb-4">
              No PIN found. Please authenticate via Host Controls first.
            </div>
            <a
              href={`/p/${encodeURIComponent(slug)}/host`}
              className="inline-block text-sm px-4 py-2 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15"
            >
              Go to Host Controls
            </a>
          </div>
        )}

        {/* Day View */}
        {!loading && pinReady && view === "day" && (
          <div className="w-full overflow-auto rounded-2xl border border-white/10">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `120px repeat(${tables.length}, minmax(180px, 1fr))`,
              }}
            >
              {/* Headers */}
              <div className="sticky top-0 z-10 bg-black/80 backdrop-blur px-3 py-2 border-b border-white/10 text-white/70 text-xs">
                Time
              </div>
              {tables.map((t) => (
                <div
                  key={`th-${t.id}`}
                  className="sticky top-0 z-10 bg-black/80 backdrop-blur px-3 py-2 border-b border-white/10 text-center"
                >
                  <div className="text-sm font-semibold">
                    {labelFor[t.id] || t.id}
                  </div>
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
                    <div
                      id={nowRow ? "now-row-anchor" : undefined}
                      className={`px-3 py-2 border-b border-white/10 text-xs text-white/70 flex items-center justify-between ${stripe} ${timeCellExtra}`}
                    >
                      <span>
                        {hh}:{mm}
                      </span>
                      {nowRow && (
                        <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-emerald-500/90 text-white">
                          NOW
                        </span>
                      )}
                    </div>

                    {tables.map((t) => {
                      const kind = cellKind(t.id, slot);
                      const item = kind === "free" ? null : findItemAt(t.id, slot);
                      const isFree = kind === "free";

                      // disable only past DAY; allow earlier-today click (we'll bump start to now in modal)
                      const disabled = isFree && isPastDay;
                      const pastDim = isPastSlot(slot) ? "opacity-50" : "";
                      const nowOutline = nowRow ? "ring-2 ring-emerald-400/50" : "";

                      // Overdue highlighting for the FIRST slot of a pending overdue booking
                      const isBooking = !!item && item.type !== "session";
                      const overdue =
                        isBooking &&
                        toDate(item!.endAt) < new Date() &&
                        item!.status !== "NO_SHOW" &&
                        item!.status !== "CANCELLED" &&
                        item!.status !== "COMPLETED";
                      const isStartSlotForItem =
                        !!item && roundTo15(slot, "down").getTime() ===
                        roundTo15(toDate(item.startAt), "down").getTime();
                      const anchorId =
                        overdue && item && isStartSlotForItem
                          ? `overdue-${item.id}`
                          : undefined;
                      const isFlashing = anchorId && flashId === item!.id;
                      const overdueRing = overdue ? "ring-2 ring-red-300" : "";

                      let label = "FREE";
                      if (!isFree) {
                        if (kind === "live") {
                          label = item?.partyName ? `LIVE — ${item.partyName}` : "LIVE";
                        } else {
                          const tag = item ? deriveBookingTag(item) : "";
                          const base = item?.partyName ? item.partyName : "";
                          if (item?.status === "COMPLETED")
                            label = base ? `COMPLETED — ${base}` : "COMPLETED";
                          else if (tag === "ARRIVED")
                            label = base ? `ARRIVED — ${base}` : "ARRIVED";
                          else if (tag === "NO-SHOW")
                            label = base ? `NO-SHOW — ${base}` : "NO-SHOW";
                          else if (tag === "DUE")
                            label = base ? `BOOKED — ${base}` : "BOOKED";
                          else label = base ? `BOOKED — ${base}` : "BOOKED";
                        }
                      } else if (isPastSlot(slot)) label = "PAST";

                      const onClick = () => {
                        if (isFree) {
                          openCreateModal(t.id, slot);
                        } else if (item) {
                          openDetailsModal(item);
                        }
                      };

                      return (
                        <div
                          key={`cellwrap-${idx}-${t.id}`}
                          id={anchorId}
                          className={`relative ${isFlashing ? "ring-2 ring-amber-300 animate-pulse" : ""}`}
                        >
                          <button
                            key={`cell-${idx}-${t.id}`}
                            type="button"
                            onClick={onClick}
                            disabled={disabled}
                            className={`w-full px-2 py-2 border-b border-white/10 text-center text-xs ${cellClass(
                              kind,
                              item?.status
                            )} ${pastDim} ${nowOutline} ${overdueRing} ${
                              isFree && !isPastDay
                                ? "hover:opacity-80"
                                : !isFree
                                ? "hover:opacity-90"
                                : "cursor-default"
                            }`}
                            title={
                              item
                                ? `${labelFor[t.id] || t.id} — ${fmtHM(
                                    toDate(item.startAt)
                                  )}–${fmtHM(toDate(item.endAt))} ${
                                    item.type === "session" ? "(live)" : "(booked)"
                                  }`
                                : `${labelFor[t.id] || t.id} — ${hh}:${mm} ${
                                    isPastSlot(slot) ? "(past)" : "(free)"
                                  }`
                            }
                          >
                            <div className="truncate">{label}</div>
                            {overdue && (
                              <div className="mt-1">
                                <span className="text-[10px] px-2 py-0.5 rounded bg-red-600 text-white">
                                  Overdue
                                </span>
                              </div>
                            )}
                          </button>

                          {overdue && item && (
                            <div className="absolute right-1 top-1 flex gap-1 z-20 pointer-events-auto">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markBookingNoShow(item.id);
                                }}
                                className="text-[10px] px-2 py-0.5 rounded bg-amber-700 hover:bg-amber-800 text-white shadow"
                                title="Mark this booking as NO-SHOW"
                              >
                                No-show
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markBookingCompleted(item.id);
                                }}
                                className="text-[10px] px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white shadow"
                                title="Mark this booking as COMPLETED"
                              >
                                Completed
                              </button>
                            </div>
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
                <span className="px-2 py-0.5 rounded bg-emerald-500/90 text-white">
                  LIVE
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-300 text-black">
                  BOOKED
                </span>
                <span className="px-2 py-0.5 rounded bg-sky-400/80 text-black">
                  ARRIVED
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-300 text-black">
                  COMPLETED
                </span>
                <span className="px-2 py-0.5 rounded bg-gray-400/60 text-black">
                  NO-SHOW
                </span>
                <span className="px-2 py-0.5 rounded bg-white text-black">FREE</span>
                <span className="px-2 py-0.5 rounded bg-white/40 text-black">
                  PAST
                </span>
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
                const liveLine = isLive
                  ? `Live until ${tile?.liveUntil ? fmtHM(tile.liveUntil) : "—"}`
                  : "Free";
                const nextLine = !isLive
                  ? tile?.nextStart
                    ? `Next ${fmtHM(tile.nextStart)}`
                    : "No more today"
                  : "";
                return (
                  <a
                    key={table.id}
                    href={`/p/${encodeURIComponent(
                      slug
                    )}/host#${encodeURIComponent(table.id)}`}
                    className={`aspect-[2/1] rounded-2xl p-3 flex flex-col items-center justify-center ${
                      isLive ? "bg-emerald-500/90 text-white" : "bg-white text-black"
                    }`}
                    aria-label={`Open table ${table.label || table.id}`}
                  >
                    <div className="text-2xl font-bold">
                      {table.label || table.id}
                    </div>
                    <div className={`text-sm ${isLive ? "text-white" : "text-black/70"}`}>
                      {tile?.loading ? "…" : liveLine}
                    </div>
                    {!isLive && (
                      <div className="text-xs text-black/50">
                        {tile?.loading ? "" : nextLine}
                      </div>
                    )}
                  </a>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => {
                  fetchDayAll();
                  refreshTiles();
                }}
                className="text-xs underline underline-offset-4 text-white/70 hover:text-white"
              >
                Refresh
              </button>
              <div className="text-[11px] text-white/40">Auto-refresh every 30s</div>
            </div>
          </>
        )}

        {/* Create Booking Modal */}
        {draft.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={closeCreateModal} />
            <div className="relative w-full max-w-md bg-slate-900 rounded-2xl border border-white/10 p-5">
              <div className="text-lg font-semibold mb-3">Create Booking</div>
              <div className="space-y-3">
                <div className="text-sm text-white/70">
                  Table:{" "}
                  <span className="font-semibold text-white">
                    {draft.tableId && (labelFor[draft.tableId] || draft.tableId)}
                  </span>
                </div>

                <label className="block text-sm">
                  <span className="text-white/70">Start</span>
                  <input
                    type="datetime-local"
                    value={new Date(draft.startAtISO).toISOString().slice(0, 16)}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        startAtISO: new Date(e.target.value).toISOString(),
                      }))
                    }
                    step={900}
                    className="mt-1 w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2"
                  />
                </label>

                <label className="block text-sm">
                  <span className="text-white/70">End</span>
                  <input
                    type="datetime-local"
                    value={new Date(draft.endAtISO).toISOString().slice(0, 16)}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        endAtISO: new Date(e.target.value).toISOString(),
                      }))
                    }
                    step={900}
                    className="mt-1 w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2"
                  />
                </label>

                <div className="flex gap-2">
                  {[30, 45, 60, 90, 120].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => updateDuration(m)}
                      className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/15 text-sm"
                    >
                      +{m}m
                    </button>
                  ))}
                </div>

                <label className="block text-sm">
                  <span className="text-white/70">Name (optional)</span>
                  <input
                    type="text"
                    value={draft.partyName}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, partyName: e.target.value }))
                    }
                    className="mt-1 w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2"
                    placeholder="Party name"
                  />
                </label>

                <label className="block text-sm">
                  <span className="text-white/70">Notes (optional)</span>
                  <textarea
                    value={draft.notes}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, notes: e.target.value }))
                    }
                    className="mt-1 w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2"
                    rows={3}
                    placeholder="Any special notes"
                  />
                </label>

                {draft.error && (
                  <div className="text-sm text-red-400">{draft.error}</div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15 text-sm"
                    disabled={draft.saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveBooking}
                    disabled={draft.saving}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm"
                  >
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
              <div className="text-xs text-white/60 mb-4">
                {details.item.type === "session" ? "Live session" : "Booking"}
              </div>

              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-white/60">Table:</span>{" "}
                  <span className="font-semibold">{details.tableLabel}</span>
                </div>
                <div>
                  <span className="text-white/60">Time:</span>{" "}
                  <span className="font-semibold">
                    {fmtHM(toDate(details.item.startAt))} –{" "}
                    {fmtHM(toDate(details.item.endAt))}
                  </span>{" "}
                  <span className="text-white/40">
                    ({itemDuration(details.item)})
                  </span>
                </div>
                {details.item.partyName && (
                  <div>
                    <span className="text-white/60">Name:</span>{" "}
                    <span className="font-semibold">{details.item.partyName}</span>
                  </div>
                )}
                {details.item.notes && (
                  <div>
                    <span className="text-white/60">Notes:</span>{" "}
                    <span className="font-semibold">{details.item.notes}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 mt-4">
                {details.item.type === "booking" && (
                  <>
                    {!["NO_SHOW", "CANCELLED", "COMPLETED"].includes(
                      details.item.status || ""
                    ) && (
                      <>
                        <button
                          type="button"
                          onClick={() => markBookingArrived(details.item!.id)}
                          className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-semibold text-sm"
                        >
                          Mark Arrived
                        </button>
                        <button
                          type="button"
                          onClick={() => seatBookingNow(details.item!)}
                          className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm"
                        >
                          Seat Now
                        </button>
                        {toDate(details.item.endAt) < new Date() && (
                          <button
                            type="button"
                            onClick={() => markBookingNoShow(details.item!.id)}
                            className="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-semibold text-sm"
                          >
                            Mark No-show
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => markBookingCompleted(details.item!.id)}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm"
                        >
                          Mark Completed
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => deleteBooking(details.item!)}
                      className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm"
                    >
                      Delete
                    </button>
                  </>
                )}

                <a
                  href={`/p/${encodeURIComponent(slug)}/host#${encodeURIComponent(
                    details.item.tableId
                  )}`}
                  className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15 text-sm"
                >
                  Open Table
                </a>

                <button
                  type="button"
                  onClick={closeDetailsModal}
                  className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15 text-sm"
                >
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
