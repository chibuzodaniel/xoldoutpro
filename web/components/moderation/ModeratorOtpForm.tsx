"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const visible = name.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(1, name.length - visible.length))}@${domain}`;
}

// The step-up factor on top of ModeratorLoginForm's email/password. Explicit
// ask: a code is only ever emailed when the moderator actively asks for one
// (the "Send code" button, or "Resend code" after) — not automatically the
// instant this mounts, which would fire a fresh email every single time the
// 60s inactivity window (useModeratorSession) lapses and bounces someone
// back here, even if they just glance away and come straight back. onVerified
// marks the session valid for another 60s of activity and hands control back
// to ModerationPage.
export function ModeratorOtpForm({ email, onVerified }: { email: string; onVerified: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function requestCode() {
    setSending(true);
    try {
      const res = await apiFetch("/api/admin/otp/request", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error("Could not send a code — try again");
      setSent(true);
      if (data.emailSent) toast.success(`Code sent to ${maskEmail(email)}.`);
      else toast.error("Couldn't confirm the code email went out — check spam, or resend.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send a code");
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/otp/verify", { method: "POST", body: JSON.stringify({ code }) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Invalid code");
      onVerified();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid code");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  if (!sent) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <p className="text-[12px] tracking-[0.22em] uppercase text-red font-semibold mb-1">Verify it&apos;s you</p>
          <h1 className="font-serif text-2xl mb-2">One more step</h1>
          <p className="text-sm text-ink-3 mb-6">We&apos;ll email a 6-digit code to {maskEmail(email)}.</p>
          <button
            type="button"
            onClick={requestCode}
            disabled={sending}
            className="w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send code"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="text-[12px] tracking-[0.22em] uppercase text-red font-semibold mb-1">Verify it&apos;s you</p>
        <h1 className="font-serif text-2xl mb-2">Enter your code</h1>
        <p className="text-sm text-ink-3 mb-6">We sent a 6-digit code to {maskEmail(email)}.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-center text-lg tracking-[0.4em] outline-none transition-colors duration-150 focus:border-red"
          />
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="mt-2 rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Verify"}
          </button>
        </form>

        <button type="button" onClick={requestCode} disabled={sending} className="mt-4 text-xs text-ink-3 disabled:opacity-50">
          {sending ? "Sending…" : "Resend code"}
        </button>
      </div>
    </main>
  );
}
