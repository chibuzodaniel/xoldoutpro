"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { firebaseAuth, googleProvider } from "@/lib/firebase/client";
import { GoogleLogo } from "@/components/ui/GoogleLogo";
import { apiFetch } from "@/lib/api";

export default function RecoverAccountPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovered, setRecovered] = useState(false);

  // The sign-in itself proves ownership (Firebase login still works for a
  // deleted account on purpose — see DELETE /api/me) — recovery is a second
  // call after that succeeds, since /api/account/recover still has to check
  // the 45-day window server-side regardless of who's asking.
  async function recover() {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch("/api/account/recover", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Couldn't recover this account");
        return;
      }
      setRecovered(true);
      setTimeout(() => router.push("/discover"), 2000);
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseAuth) return setError("Firebase isn't configured yet.");
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
      await recover();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Log in failed");
      setBusy(false);
    }
  }

  async function handleGoogle() {
    if (!firebaseAuth) return setError("Firebase isn't configured yet.");
    setError(null);
    setBusy(true);
    try {
      await signInWithPopup(firebaseAuth, googleProvider);
      await recover();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setBusy(false);
    }
  }

  if (recovered) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="w-full max-w-sm">
          <p className="font-serif text-2xl mb-2">Welcome back</p>
          <p className="text-sm text-ink-3">@{handle} has been recovered. Taking you to the app…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/xoldout-logo-transparent.png" alt="XOLDOUT" className="h-10 w-auto mb-8" />
        <p className="text-[12px] tracking-[0.22em] uppercase text-red font-semibold mb-2">Recover account</p>
        <p className="text-sm text-ink-3 mb-6">
          Sign back in as <strong>@{handle}</strong> to recover this account. This only works within the recovery
          window — after that, a XOLDOUT moderator will need to restore it instead.
        </p>

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
          {error && <p className="text-sm text-red-soft">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Recovering…" : "Sign in and recover"}
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
      </div>
    </main>
  );
}
