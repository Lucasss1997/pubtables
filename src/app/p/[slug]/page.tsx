// app/p/[slug]/host/page.tsx
"use client";

import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";

export default function HostPage() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session"); // ?session=abc123
  const [booking, setBooking] = React.useState<any>(null);
  const [session, setSession] = React.useState<any>(null);
  const [isWalkUp, setIsWalkUp] = React.useState(false);
  const [tableLabel, setTableLabel] = React.useState("Table");
  const [qrSvg, setQrSvg] = React.useState<string>("");

  // Optional: normalize PIN
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

  // Generate QR Code SVG (no lib!)
  const generateQR = (value: string) => {
    const qr = require("qrcode");
    qr.toString(
      value,
      { type: "svg", color: { dark: "#fff", light: "#0000" } },
      (err: any, string: string) => {
        if (!err) setQrSvg(string);
      }
    );
  };

  // Load data
  React.useEffect(() => {
    async function load() {
      if (sessionId) {
        const res = await fetch(`/api/bookings/validate?session=${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        setBooking(data.booking);
        setSession(data.session);
        setTableLabel(data.table.label);
        generateQR(window.location.href); // QR for this session
      } else {
        const res = await fetch(`/api/tables/${slug}`);
        const data = await res.json();
        setTableLabel(data.label || "Table");
        setIsWalkUp(data.walkUp || false);
      }
    }
    load();
  }, [sessionId, slug]);

  // Start session
  const startSession = async () => {
    const res = await fetch("/api/sessions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableSlug: slug,
        bookingId: booking?.id,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setSession(data.session);
      alert("Session started!");
    }
  };

  return (
    <div className="min-h-dvh bg-black text-white p-4 flex items-center justify-center">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">{tableLabel}</h1>
          <p className="text-white/70">{slug}</p>
        </div>

        {sessionId && booking ? (
          <div className="text-center">
            {qrSvg && (
              <div className="mb-6 inline-block p-4 bg-white rounded-2xl">
                <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
              </div>
            )}
            <p className="mb-4">Welcome, {booking.partyName || "Guest"}!</p>
            <p className="text-sm text-white/70 mb-6">
              {new Date(booking.startAt).toLocaleTimeString()} -{" "}
              {new Date(booking.endAt).toLocaleTimeString()}
            </p>

            {session ? (
              <div className="bg-green-900/50 border border-green-500 rounded-2xl p-6">
                <p className="text-xl font-bold">Session Active</p>
                <p>Started at {new Date(session.startedAt).toLocaleTimeString()}</p>
              </div>
            ) : (
              <button
                onClick={startSession}
                className="w-full bg-green-600 hover:bg-green-500 rounded-2xl py-4 text-xl font-bold"
              >
                Start Session
              </button>
            )}
          </div>
        ) : isWalkUp ? (
          <div className="text-center">
            <h2 className="text-2xl mb-6">Walk-Up Table</h2>
            <button
              onClick={startSession}
              className="w-full bg-blue-600 hover:bg-blue-500 rounded-2xl py-6 text-2xl font-bold"
            >
              Play Now – £5/hr
            </button>
            <p className="text-sm text-white/70 mt-4">Pay as you go</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-red-400 text-xl">No valid booking</p>
            <a href={`/p/${slug}`} className="underline">
              Book now
            </a>
          </div>
        )}

        <div className="mt-8 text-center">
          <a
            href={`/p/${encodeURIComponent(slug)}/host/master`}
            className="text-sm underline opacity-70"
          >
            Master Schedule
          </a>
        </div>
      </div>
    </div>
  );
}