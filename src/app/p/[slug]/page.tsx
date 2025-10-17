// app/p/[slug]/host/page.tsx
"use client";

import * as React from "react";
import { useParams } from "next/navigation";

export default function HostPage() {
  const { slug } = useParams<{ slug: string }>();

  // Optional: normalize existing PIN in sessionStorage (no blocking)
  React.useEffect(() => {
    try {
      const a = sessionStorage.getItem("host_pin") || "";
      const b = sessionStorage.getItem("hostPin") || "";
      const p = (a || b).replace(/\D/g, "").slice(0, 6);
      if (/^\d{6}$/.test(p)) {
        sessionStorage.setItem("host_pin", p);
        sessionStorage.setItem("hostPin", p);
      }
    } catch {}
  }, []);

  return (
    <div className="min-h-dvh bg-black text-white p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-semibold">{slug} · Tables</div>
          <a
            href={`/p/${encodeURIComponent(slug)}/host/master`}
            className="rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15 px-4 py-2 text-sm"
          >
            Master Schedule
          </a>
        </div>

        {/* Replace with your real tables/status UI */}
        <div className="rounded-2xl border border-white/10 p-4">
          Tables dashboard…
        </div>
      </div>
    </div>
  );
}
