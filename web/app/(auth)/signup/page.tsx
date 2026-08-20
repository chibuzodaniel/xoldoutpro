"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { firebaseAuth, googleProvider } from "@/lib/firebase/client";
import { GoogleLogo } from "@/components/ui/GoogleLogo";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseAuth) return setError("Firebase isn't configured yet. See .env.local.example.");
    setError(null);
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      if (email) await updateProfile(cred.user, { displayName: email.split("@")[0] });
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    if (!firebaseAuth) return setError("Firebase isn't configured yet. See .env.local.example.");
    setError(null);
    setBusy(true);
    try {
      await signInWithPopup(firebaseAuth, googleProvider);
      router.push("/onboarding");
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
        <p className="text-[12px] tracking-[0.22em] uppercase text-red font-semibold mb-6">Create account</p>

        <form onSubmit={handleEmailSignup} className="flex flex-col gap-3">
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
            minLength={6}
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
            Create account
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
          Already have an account?{" "}
          <Link href="/login" className="text-red-soft">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
