"use client";

import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, updateProfile } from "firebase/auth";
import { firebaseAuth, googleProvider } from "@/lib/firebase/client";
import { checkAccountDeletedAfterSignIn } from "@/lib/auth/postSignIn";
import { friendlyFirebaseError } from "@/lib/auth/firebaseError";
import { apiFetch } from "@/lib/api";
import { withNext } from "@/lib/returnTo";

// Shared by the landing page's sign-in dialog and the /login + /signup page
// (v3 auth, xoldout-mockup.html / xoldout-signup.html, 2026-11-16). Errors
// come back as plain-language messages shown inline in the form — the new
// designs replace the old toast-only errors on these screens.

export type AuthFailure = {
  ok: false;
  message: string;
  /** "email_taken" offers "Sign in instead"; "deleted" carries the handle to recover. */
  code?: "email_taken" | "bad_credentials" | "cancelled" | "deleted";
  field?: { name: "email" | "password"; message: string };
  deletedHandle?: string;
};
export type AuthSuccess = { ok: true; name: string | null; go: () => void };
export type AuthResult = AuthSuccess | AuthFailure;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Field rules from the mockup: one message per field, or "" when it's fine. */
export const rules = {
  name(v: string) {
    const t = v.trim();
    if (!t) return "Enter your full name.";
    if (t.length < 2) return "Your name needs at least 2 characters.";
    if (t.length > 80) return "That name is too long. Keep it under 80 characters.";
    return "";
  },
  email(v: string) {
    const t = v.trim();
    if (!t) return "Enter your email address.";
    if (!EMAIL_RE.test(t)) return "That email doesn’t look right. Check for typos.";
    return "";
  },
  newPassword(v: string) {
    if (!v) return "Create a password.";
    if (v.length < 8) return "Use at least 8 characters.";
    if (v.length > 128) return "Use 128 characters or fewer.";
    if (!/[A-Za-z]/.test(v)) return "Add at least one letter.";
    if (!/\d/.test(v)) return "Add at least one number.";
    return "";
  },
  password(v: string) {
    return v ? "" : "Enter your password.";
  },
};

function codeOf(err: unknown) {
  return err instanceof Error && "code" in err ? String((err as { code: unknown }).code) : "";
}

function failure(err: unknown, fallback: string): AuthFailure {
  switch (codeOf(err)) {
    case "auth/email-already-in-use":
      return {
        ok: false,
        code: "email_taken",
        message: "An account with this email already exists. Sign in instead.",
        field: { name: "email", message: "This email is already registered." },
      };
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return { ok: false, code: "bad_credentials", message: "Incorrect email or password. If you joined with Google, use Continue with Google." };
    case "auth/too-many-requests":
      return { ok: false, message: "Too many attempts. Wait a few minutes and try again." };
    case "auth/network-request-failed":
      return { ok: false, message: "Can’t reach XOLDOUT right now. Check your connection and try again." };
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return { ok: false, code: "cancelled", message: "Google sign-in was cancelled. Try again, or use your email." };
    case "auth/popup-blocked":
      return { ok: false, message: "Your browser blocked the Google window. Allow pop-ups for XOLDOUT and try again." };
    case "auth/weak-password":
      return { ok: false, field: { name: "password", message: "Choose a stronger password." }, message: "Choose a stronger password." };
    default:
      return { ok: false, message: friendlyFirebaseError(err, fallback) };
  }
}

const NOT_CONFIGURED: AuthFailure = { ok: false, message: "Sign-in isn’t available right now. Please try again later." };

/** `next`: where to land afterwards (lib/returnTo.ts). New accounts go through onboarding first. */
export function useAuthFlow(next: string) {
  const router = useRouter();
  const afterSignup = withNext("/onboarding", next);

  async function deletedCheck(): Promise<AuthFailure | null> {
    const handle = await checkAccountDeletedAfterSignIn();
    return handle ? { ok: false, code: "deleted", deletedHandle: handle, message: "You deleted this account. It can still be recovered." } : null;
  }

  async function signUp(name: string, email: string, password: string): Promise<AuthResult> {
    if (!firebaseAuth) return NOT_CONFIGURED;
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      await updateProfile(cred.user, { displayName: name.trim() || email.split("@")[0] }).catch(() => {});
      return { ok: true, name: name.trim() || null, go: () => router.push(afterSignup) };
    } catch (err) {
      return failure(err, "We couldn’t create your account. Please try again.");
    }
  }

  async function signIn(email: string, password: string): Promise<AuthResult> {
    if (!firebaseAuth) return NOT_CONFIGURED;
    try {
      const cred = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      const deleted = await deletedCheck();
      if (deleted) return deleted;
      return { ok: true, name: cred.user.displayName, go: () => router.push(next) };
    } catch (err) {
      return failure(err, "We couldn’t sign you in. Please try again.");
    }
  }

  /** Google creates the account the first time and signs in after that. */
  async function google(mode: "signup" | "signin"): Promise<AuthResult> {
    if (!firebaseAuth) return NOT_CONFIGURED;
    try {
      const cred = await signInWithPopup(firebaseAuth, googleProvider);
      const deleted = await deletedCheck();
      if (deleted) return deleted;
      // Same as the old pages: "Create account" goes through onboarding, "Sign in" goes straight on
      // (app/(app)/layout.tsx still sends anyone who hasn't onboarded there).
      return { ok: true, name: cred.user.displayName, go: () => router.push(mode === "signup" ? afterSignup : next) };
    } catch (err) {
      return failure(err, "We couldn’t finish signing you in with Google. Please try again.");
    }
  }

  /** Always "sent" when the request works: never reveals whether an email has an account. */
  async function sendReset(email: string): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await apiFetch("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      if (!res.ok) throw new Error();
      return { ok: true, message: "If there’s an account for that email, a reset link is on its way. Check your inbox and spam folder." };
    } catch {
      return { ok: false, message: "We couldn’t send a reset link right now. Please try again." };
    }
  }

  return { signUp, signIn, google, sendReset };
}
