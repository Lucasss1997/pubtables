"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  slug?: string;
  redirectTo?: string; // optional override
  onVerified?: (result: { pubId: string; slug: string }) => void;
};

export default function SecurePinInput({
  slug = "theriser",
  redirectTo,
  onVerified,
}: Props) {
  const [pin, setPin] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const normSlug = slug.toLowerCase();

  useEffect(() => {
    const t = setTimeout(() => inputRefs.current[0]?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const setInputRef = (i: number) => (el: HTMLInputElement | null) => {
    inputRefs.current[i] = el;
  };

  const handleChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) {
      if (inputRefs.current[index]) inputRefs.current[index]!.value = "";
      return;
    }
    const next = [...pin];
    next[index] = value;
    setPin(next);
    setError("");

    if (value && index < 5) setTimeout(() => inputRefs.current[index + 1]?.focus(), 10);
    if (index === 5 && value) handleSubmit(next.join(""));
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = pin.join("");
      if (v.length === 6) handleSubmit(v);
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...pin];
      if (next[index]) {
        next[index] = "";
        setPin(next);
      } else if (index > 0) {
        next[index - 1] = "";
        setPin(next);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (pasted.length === 6) {
      setPin(pasted.split(""));
      setTimeout(() => {
        inputRefs.current[5]?.focus();
        handleSubmit(pasted);
      }, 20);
    }
  };

  const handleFocus = (index: number) => {
    setTimeout(() => inputRefs.current[index]?.select(), 10);
  };

  const destination = (slugStr: string) =>
    redirectTo || `/p/${encodeURIComponent(slugStr)}/host?tab=tables`;

  const handleSubmit = async (pinValue: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: normSlug, pin: pinValue }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        try {
          // ✅ write BOTH keys so every page can see the PIN
          sessionStorage.setItem("hostPin", pinValue);
          sessionStorage.setItem("host_pin", pinValue);

          sessionStorage.setItem("slug", normSlug);
          if (data.pubId) sessionStorage.setItem("pubId", String(data.pubId));

          // Nudge every host page to default to Tables
          sessionStorage.setItem("hostPreferredTab", "tables");
          sessionStorage.setItem("activeTab", "tables");
          sessionStorage.setItem("tab", "tables");
          localStorage.setItem("hostPreferredTab", "tables");
        } catch { /* non-fatal */ }

        onVerified?.({ pubId: data.pubId ?? "", slug: normSlug });

        // Full navigation so the next page definitely sees sessionStorage
        window.location.assign(destination(normSlug));
        return;
      }

      setError(data.reason || "Invalid PIN");
      setPin(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      setError("Connection error. Please try again.");
      setPin(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = () => {
    const v = pin.join("");
    if (v.length === 6) handleSubmit(v);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Host Access</h1>
          <p className="text-slate-400">Enter your 6-digit PIN</p>
        </div>

        <div className="flex justify-center gap-3 mb-6">
          {pin.map((digit, index) => (
            <input
              key={`pin-${index}`}
              ref={setInputRef(index)}
              type="password"              // mask digits
              inputMode="numeric"          // show numeric keypad on mobile
              pattern="[0-9]"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={index === 0 ? handlePaste : undefined}
              onFocus={() => handleFocus(index)}
              disabled={loading}
              autoComplete="new-password"  // discourage autofill
              className="w-12 h-14 text-center text-2xl font-bold bg-slate-700 text-white border-2 border-slate-600 rounded-lg focus:border-blue-500 focus:outline-none transition-colors disabled:opacity-50"
            />
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 rounded-lg p-3 mb-4 text-center text-sm">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleManualSubmit}
          disabled={loading || pin.join("").length !== 6}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
        >
          {loading ? "Verifying..." : "Verify PIN"}
        </button>

        <div className="mt-6 text-center text-sm text-slate-400">
          <p>🔒 PIN must be entered manually each time</p>
        </div>
      </div>
    </div>
  );
}
