"use client";

import { useSearchParams } from "next/navigation";

export default function DashboardPage() {
  const sp = useSearchParams();
  const slug = (sp.get("slug") || "theriser").toLowerCase();
  const s = encodeURIComponent(slug);

  const links = [
    // Force the Tiles view explicitly (covering several param names)
    { href: `/p/${s}/host?tab=tables&view=tiles&layout=tiles&mode=tiles`, label: "Tables" },
    { href: `/bookings?slug=${s}`, label: "Bookings" },
    { href: `/scores?slug=${s}`, label: "Scores" },
    { href: `/leaderboard?slug=${s}`, label: "Leaderboard" },
  ];

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <h1 className="text-2xl font-bold mb-4">
        PubTables Dashboard <span className="opacity-60">/ {slug}</span>
      </h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 hover:bg-slate-800 transition"
          >
            <div className="text-lg font-semibold">{l.label}</div>
            <div className="text-sm opacity-70 break-all">{l.href}</div>
          </a>
        ))}
      </div>
    </main>
  );
}
