"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { firebaseAuth, googleProvider } from "@/lib/firebase/client";
import { checkAccountDeletedAfterSignIn } from "@/lib/auth/postSignIn";
import { GoogleLogo } from "@/components/ui/GoogleLogo";
import { useInstallGuide } from "@/components/pwa/InstallGuideProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { friendlyFirebaseError } from "@/lib/auth/firebaseError";
import Link from "next/link";

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-red" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.415 2.06-1.246 2.77-.895.75-1.966 1.15-3.007 1.07-.14-1.1.39-2.24 1.2-2.98.87-.8 2.05-1.29 3.05-1.36v.5zM20.5 17.34c-.55 1.28-.81 1.85-1.52 2.98-.99 1.57-2.39 3.53-4.12 3.55-1.54.02-1.94-1-4.02-1-2.08 0-2.53.98-4.06 1.02-1.66.04-2.93-1.7-3.93-3.26-2.68-4.18-2.96-9.08-1.31-11.7 1.17-1.86 3.02-2.95 4.76-2.95 1.77 0 2.88 1.03 4.34 1.03 1.42 0 2.28-1.03 4.32-1.03 1.55 0 3.19.85 4.36 2.31-3.83 2.15-3.21 7.74.18 9.05z" />
    </svg>
  );
}

function AndroidIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
      <path d="M6.5 8.5v6a1 1 0 001 1h.5v3a1.2 1.2 0 002.4 0v-3h1.2v3a1.2 1.2 0 002.4 0v-3h.5a1 1 0 001-1v-6h-9zM5.5 8.5a1 1 0 00-1 1v4.5a1.1 1.1 0 002.2 0V9.5a1 1 0 00-1.2-1zM18.5 8.5a1 1 0 00-1.2 1v4.5a1.1 1.1 0 002.2 0V9.5a1 1 0 00-1-1zM8.4 4.9l-.85-1.47a.35.35 0 01.6-.35l.87 1.5a5.6 5.6 0 014 0l.87-1.5a.35.35 0 01.6.35l-.85 1.47a4.9 4.9 0 012.4 3.6h-9.6a4.9 4.9 0 012.4-3.6zM9.2 6.8a.55.55 0 110-1.1.55.55 0 010 1.1zm4.6 0a.55.55 0 110-1.1.55.55 0 010 1.1z" />
    </svg>
  );
}

function ChevronIcon({ open, className = "text-ink-3" }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${className} ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const toast = useToast();
  const installGuide = useInstallGuide();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletedHandle, setDeletedHandle] = useState<string | null>(null);
  // Explicit ask: this page shouldn't need scrolling at all — collapsed by
  // default so the install steps (the single biggest chunk of content
  // below the fold) don't force it, expandable for anyone who actually
  // wants them.
  const [installOpen, setInstallOpen] = useState(false);

  // Explicit ask: "Install now" should trigger the install immediately, not
  // route through an explainer first. Where a real native prompt exists
  // (Chrome/Edge-family — installGuide.canInstall), fire it directly so the
  // browser's own confirm dialog shows right away. There's no equivalent on
  // iOS Safari — Apple exposes no programmatic install API at all — so that
  // case (and any other browser without a captured prompt) falls back to
  // the sheet's manual Share-sheet walkthrough, the only path that exists.
  function handleInstallNow() {
    if (installGuide.canInstall) installGuide.promptInstall();
    else installGuide.open();
  }

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseAuth) return toast.error("Firebase isn't configured yet. See .env.local.example.");
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      if (email) await updateProfile(cred.user, { displayName: email.split("@")[0] });
      router.push("/onboarding");
    } catch (err) {
      toast.error(friendlyFirebaseError(err, "Sign-up failed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    if (!firebaseAuth) return toast.error("Firebase isn't configured yet. See .env.local.example.");
    setBusy(true);
    try {
      await signInWithPopup(firebaseAuth, googleProvider);
      // signInWithPopup logs in an *existing* Google-linked account rather
      // than erroring like createUserWithEmailAndPassword would — so someone
      // hitting "sign up" with a Google account that's actually a deleted
      // account needs the same recovery prompt as the login page.
      const deleted = await checkAccountDeletedAfterSignIn();
      if (deleted) {
        setDeletedHandle(deleted);
        return;
      }
      router.push("/onboarding");
    } catch (err) {
      toast.error(friendlyFirebaseError(err, "Google sign-in failed"));
    } finally {
      setBusy(false);
    }
  }

  if (deletedHandle) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/xoldout-logo-transparent.png" alt="XOLDOUT" className="h-10 w-auto mb-8" />
          <p className="text-[12px] tracking-[0.22em] uppercase text-red font-semibold mb-6">Account deleted</p>
          <div className="rounded-lg border border-red-soft bg-red/10 px-4 py-4 mb-4">
            <p className="text-sm font-semibold mb-1">You deleted this account</p>
            <p className="text-sm text-ink-3">It&apos;s still within its 45-day recovery window. Click below to get it back.</p>
          </div>
          <Link
            href={`/recoveraccount/${deletedHandle}`}
            className="block w-full rounded-lg bg-red px-4 py-3 text-center text-sm font-semibold text-white"
          >
            Click here to recover it
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      {/* Explicit ask: restyled to match a supplied marketing-page mockup —
          hero headline, big CTA, PWA install guide — rather than the plain
          logo+form the auth pages used before. The actual email/password
          form still has to exist somewhere on the page for signup to work
          at all (the mockup only showed the CTA button, no input fields),
          so it's placed directly under the subheadline, ahead of the button
          it submits. */}
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/xoldout-logo-transparent.png" alt="XOLDOUT" className="h-6 w-auto" />
        </div>
        <Link
          href="/login"
          className="rounded-full border border-red px-3 py-1 text-xs font-semibold text-red-soft"
        >
          Log in
        </Link>
      </div>

      <div className="px-6 pt-2 pb-4 max-w-sm mx-auto text-center">
        <h1 className="font-serif text-2xl leading-tight mb-2">
          Sell directly. Get paid. Build <span className="text-red">your fanbase.</span>
        </h1>
        <p className="text-xs text-ink-3 mb-4">
          XOLDOUT is the all-in-one platform for artists to sell music, beats, merch, tickets and more — directly to
          your fans.
        </p>

        <form onSubmit={handleEmailSignup} className="flex flex-col gap-2 text-left mb-1">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-0.5 rounded-full bg-red px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            Sign up for free
          </button>
        </form>

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink-3 mb-3">
          <CheckCircleIcon />
          Free forever. No card required.
        </p>

        <div className="flex items-center gap-3 text-ink-3 text-xs mb-3">
          <div className="h-px flex-1 bg-line" />
          or
          <div className="h-px flex-1 bg-line" />
        </div>

        <button
          onClick={handleGoogle}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2.5 rounded-full border border-line px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          <GoogleLogo />
          Sign up with Google
        </button>

        <p className="mt-4 text-xs text-ink-3">
          Already have an account?{" "}
          <Link href="/login" className="text-red-soft font-semibold">
            Log in
          </Link>
        </p>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => setInstallOpen((v) => !v)}
            aria-expanded={installOpen}
            className="w-full flex items-center justify-between rounded-xl border border-red/30 bg-red/10 px-4 py-3"
          >
            <h2 className="font-serif text-lg text-red-soft">How to install Xoldout</h2>
            <ChevronIcon open={installOpen} className="text-red-soft" />
          </button>
          {installOpen && (
            <div className="grid grid-cols-2 gap-4 text-left mt-4">
              <div className="flex flex-col items-center text-center">
                <AppleIcon />
                <p className="text-sm font-semibold mt-2 mb-3">iPhone (iOS)</p>
                {/* No "Install now" button here on purpose — iOS Safari has
                    no programmatic install API at all (true of every
                    website, not something this app can work around), so a
                    button implying a one-tap install would be dishonest.
                    The steps are the only real path. */}
                <ol className="text-xs text-ink-3 flex flex-col gap-1.5">
                  <li>1. Tap the Share button</li>
                  <li>2. Scroll down and tap Add to Home Screen</li>
                  <li>3. Tap Add in the top right corner</li>
                </ol>
              </div>
              <div className="flex flex-col items-center text-center">
                <AndroidIcon />
                <p className="text-sm font-semibold mt-2 mb-3">Android</p>
                <ol className="text-xs text-ink-3 flex flex-col gap-1.5 mb-4">
                  <li>1. Tap the menu (⋮) in your browser</li>
                  <li>2. Tap Add to Home Screen</li>
                  <li>3. Tap Add</li>
                </ol>
                <button
                  type="button"
                  onClick={handleInstallNow}
                  className="w-full rounded-lg bg-surface-2 px-3 py-2 text-xs font-semibold"
                >
                  Install now
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-[11px] text-ink-3">Join thousands of artists building their empire with Xoldout.</p>
      </div>
    </main>
  );
}
