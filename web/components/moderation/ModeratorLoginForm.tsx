"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { friendlyFirebaseError } from "@/lib/auth/firebaseError";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useToast } from "@/components/ui/ToastProvider";

export function ModeratorLoginForm() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseAuth) return toast.error("Firebase isn't configured yet. See .env.local.example.");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    } catch (err) {
      toast.error(friendlyFirebaseError(err, "Log in failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="text-[12px] tracking-[0.22em] uppercase text-red font-semibold mb-1">Moderator access</p>
        <h1 className="font-serif text-2xl mb-6">Moderation dashboard</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
          />
          <PasswordInput
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Logging in…" : "Log in"}
          </button>
        </form>
      </div>
    </main>
  );
}

