"use client";

import { useState } from "react";
import type { GuestInfo } from "@/lib/useGuestCheckout";

type Props = {
  open: boolean;
  onSubmit: (info: GuestInfo) => void;
  onClose: () => void;
};

// Remembers a confirmed email for this browser tab, so a second guest
// purchase right after the first doesn't need another code. The server still
// checks the token on every order (lib/commerce/guestVerification.ts) and it
// expires after an hour — this only skips asking again.
const VERIFIED_KEY = "xoldout-guest-verified";

// Reused for 50 minutes — safely inside the server's 1-hour token window.
const REUSE_MS = 50 * 60 * 1000;

function readVerified(): { email: string; token: string } | null {
  try {
    const raw = sessionStorage.getItem(VERIFIED_KEY);
    const saved = raw ? (JSON.parse(raw) as { email: string; token: string; at: number }) : null;
    return saved && Date.now() - saved.at < REUSE_MS ? saved : null;
  } catch {
    return null;
  }
}

function saveVerified(email: string, token: string) {
  try {
    sessionStorage.setItem(VERIFIED_KEY, JSON.stringify({ email, token, at: Date.now() }));
  } catch {
    // private mode etc. — they'll just be asked for a code again next time
  }
}

// Same bottom-sheet shell as GatewayPickerSheet — dims the page behind it,
// closes on backdrop click. Name + email only, on purpose: "the checkout
// must NOT require account creation, login, username, password, or profile
// completion." Email is what a guest's purchase and account end up keyed on
// (lib/commerce/guestCheckout.ts), so it has to be confirmed first (explicit
// ask, 2026-10-15): step two emails a 6-digit code the buyer types in.
export function GuestInfoSheet({ open, onSubmit, onClose }: Props) {
  const [step, setStep] = useState<"details" | "code">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function reset() {
    setStep("details");
    setName("");
    setEmail("");
    setCode("");
    setError(null);
    setNotice(null);
  }

  function finish(token: string) {
    const info = { name: name.trim(), email: email.trim().toLowerCase(), verificationToken: token };
    reset();
    onSubmit(info);
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/guest-checkout/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't send the code. Try again.");
        return false;
      }
      return true;
    } catch {
      setError("Couldn't send the code. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    const remembered = readVerified();
    if (remembered && remembered.email === email.trim().toLowerCase()) {
      finish(remembered.token);
      return;
    }
    if (await sendCode()) {
      setCode("");
      setStep("code");
    }
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/guest-checkout/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.verificationToken) {
        setError(data.error ?? "Couldn't check the code. Try again.");
        return;
      }
      saveVerified(email.trim().toLowerCase(), data.verificationToken);
      finish(data.verificationToken);
    } catch {
      setError("Couldn't check the code. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (await sendCode()) setNotice("New code sent.");
  }

  function close() {
    reset();
    onClose();
  }

  const inputClass =
    "rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${
        open ? "bg-black/60" : "pointer-events-none bg-black/0"
      }`}
      onClick={close}
      aria-hidden={!open}
    >
      <div
        className={`relative w-full rounded-t-2xl border-t border-line-soft bg-surface px-4 pt-6 pb-8 transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {step === "details" ? (
          <>
            <h2 className="font-serif text-xl mb-1">Your details</h2>
            <p className="text-sm text-ink-3 mb-5">
              No account needed — we&apos;ll send a code to confirm your email, then use it to send your purchase and keep it safe.
            </p>
            <form onSubmit={handleDetails} className="flex flex-col gap-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required className={inputClass} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                required
                autoComplete="email"
                className={inputClass}
              />
              {error && <p className="text-xs text-red-soft">{error}</p>}
              <button type="submit" disabled={busy} className="rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white mt-1 disabled:opacity-60">
                {busy ? "Sending code…" : "Continue"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2 className="font-serif text-xl mb-1">Check your email</h2>
            <p className="text-sm text-ink-3 mb-5">
              We sent a 6-digit code to <span className="text-ink">{email.trim()}</span>. Enter it to continue.
            </p>
            <form onSubmit={handleCode} className="flex flex-col gap-3">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                className={`${inputClass} text-center text-2xl tracking-[0.5em] font-semibold`}
              />
              {error && <p className="text-xs text-red-soft">{error}</p>}
              {notice && !error && <p className="text-xs text-green">{notice}</p>}
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white mt-1 disabled:opacity-60"
              >
                {busy ? "Checking…" : "Confirm and continue"}
              </button>
            </form>
            <div className="flex items-center justify-between mt-4 text-xs">
              <button
                type="button"
                onClick={() => {
                  setStep("details");
                  setError(null);
                  setNotice(null);
                }}
                className="text-ink-3 font-semibold"
              >
                Change email
              </button>
              <button type="button" onClick={resend} disabled={busy} className="text-ink-2 font-semibold disabled:opacity-50">
                Resend code
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
