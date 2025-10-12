"use client";

import type React from "react";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = {
  slug?: string; // default "theriser" if not provided
};

export default function SecurePinInput({ slug = "theriser" }: Props) {
  const router = useRouter();

  const [pin, setPin] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [renderKey, setRenderKey] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Force re-render every 100ms to break autofill
  useEffect(() => {
    const interval = setInterval(() => setRenderKey((prev) => prev + 1), 100);
    return () => clearInterval(interval);
  }, []);

  // Change URL to break browser's URL-based autofill memory
  useEffect(() => {
    const randomParam = Math.random().toString(36).substring(7);
    const url = new URL(window.location.href);
    url.searchParams.set("_", randomParam);
    window.history.replaceState({}, "", url.toString());
  }, []);

  // Focus first input on mount and after re-render
  useEffect(() => {
    const timer = setTimeout(() => inputRefs.current[0]?.focus(), 50);
    return () => clearTimeout(timer);
  }, [renderKey]);

  // Clear any autofilled values
  useEffect(() => {
    inputRefs.current.forEach((input, idx) => {
      if (input && input.value !== pin[idx]) input.value = pin[idx];
    });
  });

  const handleChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) {
      if (inputRefs.current[index]) inputRefs.current[index]!.value = "";
      return;
    }
    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    setError("");

    if (value && index < 5) setTimeout(() => inputRefs.current[index + 1]?.focus(), 10);
    if (index === 5 && value) handleSubmit(newPin.join(""));
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const newPin = [...pin];
      if (newPin[index]) {
        newPin[index] = "";
        setPin(newPin);
      } else if (index > 0) {
        newPin[index - 1] = "";
        setPin(newPin);
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
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "");
    if (pastedData.length === 6) {
      const newPin = pastedData.split("");
      setPin(newPin);
      setTimeout(() => {
        inputRefs.current[5]?.focus();
        handleSubmit(pastedData);
      }, 50);
    }
  };

  const handleFocus = (index: number) => {
    setTimeout(() => inputRefs.current[index]?.select(), 10);
  };

  const handleSubmit = async (pinValue: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, pin: pinValue }),
      });
      const data = await response.json();

      if (response.ok && data.ok) {
        // Persist lightweight info (avoid long-lived secrets)
        sessionStorage.setItem("hostPin", pinValue);
        sessionStorage.setItem("pubId", data.pubId ?? "");
        sessionStorage.setItem("slug", slug);

        // 👉 Redirect to the admin/host dashboard
        router.push(`/admin?slug=${encodeURIComponent(slug)}`);
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
    const pinValue = pin.join("");
    if (pinValue.length === 6) handleSubmit(pinValue);
  };

  // callback ref (must return void)
  const setInputRef = (index: number) => (el: HTMLInputElement | null): void => {
    inputRefs.current[index] = el;
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl p-8 w-full max-w-md">
        <style>{`
          input:-webkit-autofill,
          input:-webkit-autofill:hover,
          input:-webkit-autofill:focus,
          input:-webkit-autofill:active {
            -webkit-text-fill-color: transparent !important;
            -webkit-box-shadow: 0 0 0 30px #334155 inset !important;
            background-color: #334155 !important;
            transition: background-color 5000s ease-in-out 0s !important;
          }
        `}</style>

        {/* Hidden decoys to poison autofill */}
        <div style={{ position: "absolute", left: "-9999px" }} aria-hidden="true">
          <input type="text" name="username" autoComplete="username" tabIndex={-1} />
          <input type="password" name="password" autoComplete="current-password" tabIndex={-1} />
          <input type="email" name="email" autoComplete="email" tabIndex={-1} />
          <input type="tel" name="phone" autoComplete="tel" tabIndex={-1} />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Host Access</h1>
          <p className="text-slate-400">Enter your 6-digit PIN</p>
        </div>

        <div className="flex justify-center gap-3 mb-6" key={`pin-container-${renderKey}`}>
          {pin.map((digit, index) => (
            <input
              key={`pin-${renderKey}-${index}`}
              ref={setInputRef(index)}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={index === 0 ? handlePaste : undefined}
              onFocus={() => handleFocus(index)}
              disabled={loading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-form-type="other"
              name={`otp-${renderKey}-${index}`}
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
