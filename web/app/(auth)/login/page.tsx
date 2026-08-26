"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { firebaseAuth, googleProvider } from "@/lib/firebase/client";
import { checkAccountDeletedAfterSignIn } from "@/lib/auth/postSignIn";
import { apiFetch } from "@/lib/api";
import { GoogleLogo } from "@/components/ui/GoogleLogo";
import Link from "next/link";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  // A gift claim link redirects here when signed out (?next=/gifts/claim/...)
  // so login lands the user back on the flow they came from, not /discover.
  const next = useSearchParams().get("next") || "/discover";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletedHandle, setDeletedHandle] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseAuth) return setError("Firebase isn't configured yet. See .env.local.example.");
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
      const deleted = await checkAccountDeletedAfterSignIn();
      if (deleted) {
        setDeletedHandle(deleted);
        return;
      }
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Log in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setResetError(null);
    setResetBusy(true);
    try {
      // Server generates the reset link and sends its own branded email via
      // Resend (see /api/auth/reset-password) instead of Firebase's plain-text
      // default. Always shows the same "check your email" outcome regardless
      // of the response — this page never confirms or denies whether an email
      // is registered, same as before.
      const res = await apiFetch("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ email: resetEmail }) });
      if (!res.ok) throw new Error("Could not send a reset link");
      setResetSent(true);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Could not send a reset link");
    } finally {
      setResetBusy(false);
    }
  }

  function backToLogin() {
    setMode("login");
    setResetEmail("");
    setResetError(null);
    setResetSent(false);
  }

  async function handleGoogle() {
    if (!firebaseAuth) return setError("Firebase isn't configured yet. See .env.local.example.");
    setError(null);
    setBusy(true);
    try {
      await signInWithPopup(firebaseAuth, googleProvider);
      const deleted = await checkAccountDeletedAfterSignIn();
      if (deleted) {
        setDeletedHandle(deleted);
        return;
      }
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/xoldout-logo-transparent.png" alt="XOLDOUT" className="h-10 w-auto mb-8" />

        {mode === "reset" ? (
          <>
            <p className="text-[12px] tracking-[0.22em] uppercase text-red font-semibold mb-6">Reset password</p>
            {resetSent ? (
              <>
                <div className="rounded-lg border border-line-soft bg-surface px-4 py-4 mb-4">
                  <p className="text-sm font-semibold mb-1">Check your email</p>
                  <p className="text-sm text-ink-3">
                    If an account exists for {resetEmail}, we&apos;ve sent a link to reset the password.
                  </p>
                </div>
                <button type="button" onClick={backToLogin} className="text-sm text-red-soft">
                  Back to log in
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-3 mb-6">Enter your email and we&apos;ll send you a link to reset your password.</p>
                <form onSubmit={handleResetPassword} className="flex flex-col gap-3">
                  <input
                    type="email"
                    required
                    placeholder="Email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
                  />
                  {resetError && <p className="text-sm text-red-soft">{resetError}</p>}
                  <button
                    type="submit"
                    disabled={resetBusy}
                    className="mt-2 rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {resetBusy ? "Sending…" : "Send reset link"}
                  </button>
                </form>
                <button type="button" onClick={backToLogin} className="mt-4 text-sm text-ink-3">
                  Back to log in
                </button>
              </>
            )}
          </>
        ) : deletedHandle ? (
          <>
            <p className="text-[12px] tracking-[0.22em] uppercase text-red font-semibold mb-6">Account deleted</p>
            <div className="rounded-lg border border-red-soft bg-red/10 px-4 py-4 mb-4">
              <p className="text-sm font-semibold mb-1">You deleted this account</p>
              <p className="text-sm text-ink-3">
                It&apos;s still within its 45-day recovery window. Click below to get it back.
              </p>
            </div>
            <Link
              href={`/recoveraccount/${deletedHandle}`}
              className="block w-full rounded-lg bg-red px-4 py-3 text-center text-sm font-semibold text-white"
            >
              Click here to recover it
            </Link>
          </>
        ) : (
          <>
            <p className="text-[12px] tracking-[0.22em] uppercase text-red font-semibold mb-6">Welcome back</p>

            <form onSubmit={handleEmailLogin} className="flex flex-col gap-3">
              <input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
              />
              <input
                type="password"
                required
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
              />
              <button
                type="button"
                onClick={() => {
                  setMode("reset");
                  setResetEmail(email);
                }}
                className="self-end text-xs text-ink-3"
              >
                Forgot password?
              </button>
              {error && <p className="text-sm text-red-soft">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="mt-2 rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Log in
              </button>
            </form>

            <div className="my-5 flex items-center gap-3 text-ink-3 text-xs">
              <div className="h-px flex-1 bg-line" />
              or
              <div className="h-px flex-1 bg-line" />
            </div>

            <button
              onClick={handleGoogle}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-line px-4 py-3 text-sm font-semibold disabled:opacity-50"
            >
              <GoogleLogo />
              Continue with Google
            </button>

            <p className="mt-8 text-sm text-ink-3">
              New here?{" "}
              <Link href="/signup" className="text-red-soft">
                Create an account
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
