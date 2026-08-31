"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { verifyPasswordResetCode, confirmPasswordReset } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import Link from "next/link";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function friendlyError(err: unknown): string {
  const code = err instanceof Error && "code" in err ? String((err as { code: unknown }).code) : null;
  if (code === "auth/expired-action-code") return "This link has expired. Request a new one.";
  if (code === "auth/invalid-action-code") return "This link has already been used or is invalid. Request a new one.";
  if (code === "auth/user-disabled") return "This account has been disabled.";
  if (code === "auth/user-not-found") return "This link is no longer valid. Request a new one.";
  if (code === "auth/weak-password") return "Choose a stronger password (at least 6 characters).";
  return "Something went wrong. Request a new link.";
}

// Handles the reset link's oobCode ourselves instead of letting it resolve
// to Firebase's own default-hosted action page. Two reasons, both explicit
// asks: (1) that hosted page is on a Firebase-branded domain, not this
// app's; (2) it's genuinely vulnerable to being silently consumed by an
// email client's link-safety prescan (Outlook Safe Links and similar do a
// plain GET on every link in an email before the user ever clicks) — a
// prescanned Firebase action link burns the one-time code, so the user's
// own click then fails with "this link has already been used." Building
// the confirmation step ourselves avoids that: verifyPasswordResetCode
// below only *validates* the code (safe against a GET-only prescan), and
// the code is only actually consumed by confirmPasswordReset, which fires
// solely from this page's own form submission — something a prescanner
// never does. See POST /api/auth/reset-password for the actionCodeSettings
// that route the emailed link here instead of Firebase's hosted page.
function ResetPasswordForm() {
  const router = useRouter();
  const oobCode = useSearchParams().get("oobCode");
  const [status, setStatus] = useState<"verifying" | "ready" | "invalid" | "success">("verifying");
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time verification on mount, not derived render state */
    if (!firebaseAuth || !oobCode) {
      setStatus("invalid");
      return;
    }
    verifyPasswordResetCode(firebaseAuth, oobCode)
      .then((resolvedEmail) => {
        setEmail(resolvedEmail);
        setStatus("ready");
      })
      .catch((err) => {
        setError(friendlyError(err));
        setStatus("invalid");
      });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [oobCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseAuth || !oobCode) return;
    setError(null);
    if (password !== confirmPassword) return setError("Passwords don't match");

    setBusy(true);
    try {
      await confirmPasswordReset(firebaseAuth, oobCode, password);
      setStatus("success");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/xoldout-logo-transparent.png" alt="XOLDOUT" className="h-10 w-auto mb-8" />
        <p className="text-[12px] tracking-[0.22em] uppercase text-red font-semibold mb-6">Reset password</p>

        {status === "verifying" && <p className="text-sm text-ink-3">Checking your link…</p>}

        {status === "invalid" && (
          <>
            <div className="rounded-lg border border-red-soft bg-red/10 px-4 py-4 mb-4">
              <p className="text-sm">{error ?? "This link is invalid."}</p>
            </div>
            <Link href="/login" className="text-sm text-red-soft font-semibold">
              Back to log in
            </Link>
          </>
        )}

        {status === "ready" && (
          <>
            {email && <p className="text-sm text-ink-3 mb-6">Set a new password for {email}.</p>}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="password"
                required
                minLength={6}
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
              />
              {error && <p className="text-sm text-red-soft">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="mt-2 rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Saving…" : "Set new password"}
              </button>
            </form>
          </>
        )}

        {status === "success" && (
          <>
            <div className="rounded-lg border border-line-soft bg-surface px-4 py-4 mb-4">
              <p className="text-sm font-semibold mb-1">Password updated</p>
              <p className="text-sm text-ink-3">You can now log in with your new password.</p>
            </div>
            <button
              onClick={() => router.push("/login")}
              className="w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white"
            >
              Go to log in
            </button>
          </>
        )}
      </div>
    </main>
  );
}
