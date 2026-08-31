"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";
import { apiFetch } from "@/lib/api";

export type SocialLink = { platform: "Instagram" | "X" | "TikTok" | "YouTube" | "Website"; url: string };

export type AppUser = {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  tags: string[];
  socialLinks: SocialLink[];
  pushEnabled: boolean;
  emailDigestSubscribed: boolean;
  isModerator: boolean;
  isSuperModerator: boolean;
  isVerified: boolean;
  verificationBadges: string[];
};

type AuthState = {
  firebaseUser: FirebaseUser | null;
  appUser: AppUser | null;
  loading: boolean;
  needsOnboarding: boolean;
  refreshAppUser: () => Promise<void>;
  // True exactly once per tab, for a visitor who has never signed in this
  // session and whose very first pageview this tab is (see isFirstLoadThisTab
  // below) — i.e. plausibly "just clicked a shared link," not "reloaded a
  // page mid-session" or "logged out a moment ago." Explicit ask, "for now":
  // consumers use this to send a first-time visitor to /signup instead of
  // /login on a route that isn't meant to be browsed signed-out. Computed
  // once here (the one place that owns both the auth-state stream and the
  // per-tab "have we checked yet" flag) and read wherever a redirect
  // decision needs it — app/(app)/layout.tsx's existing gate, and
  // NewVisitorGate.tsx for the one public route outside that layout
  // ( /u/[handle] ) — rather than each duplicating this computation.
  isNewVisitor: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

// sessionStorage (tab-scoped, cleared only when the tab closes — survives a
// same-tab reload) is what distinguishes "just arrived" from "already
// browsing": a share link almost always opens in a fresh tab, and a signed-
// out visitor reloading a page they were already looking at shouldn't get
// treated as a brand-new one just for pressing refresh.
const FIRST_LOAD_KEY = "xoldout-visited";

function isFirstLoadThisTab() {
  try {
    if (sessionStorage.getItem(FIRST_LOAD_KEY)) return false;
    sessionStorage.setItem(FIRST_LOAD_KEY, "1");
    return true;
  } catch {
    return false; // storage unavailable (private mode, etc.) — fail open
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isNewVisitor, setIsNewVisitor] = useState(false);
  // Once true for the life of this tab, isNewVisitor can never become true —
  // a signed-out callback after a real sign-in (a deliberate logout, most
  // obviously) is not "a new visitor," regardless of exactly when it fires
  // relative to that flow's own router.push("/login").
  const hasSignedInRef = useRef(false);

  const syncAppUser = useCallback(async () => {
    const res = await apiFetch("/api/auth/sync", { method: "POST" });
    if (!res.ok) return;
    const data = await res.json();
    // A deleted account still has a working Firebase login (on purpose, so
    // its owner can sign back in to recover it) — send them to the recovery
    // prompt instead of exposing them to the rest of the app as "logged in".
    // /login and /signup skip this auto-redirect too: they show their own
    // inline "you deleted this account" prompt right after sign-in (see
    // handleEmailLogin/handleGoogle there) instead of silently bouncing the
    // user away before they can read it.
    if (data.accountDeleted) {
      setAppUser(null);
      if (!pathname?.startsWith("/recoveraccount/") && pathname !== "/login" && pathname !== "/signup") {
        router.replace(`/recoveraccount/${data.user.handle}`);
      }
      return;
    }
    setAppUser(data.user);
    setNeedsOnboarding(Boolean(data.needsOnboarding));
  }, [pathname, router]);

  useEffect(() => {
    if (!firebaseAuth) {
      if (!firebaseConfigured) {
        console.warn("Firebase is not configured — set NEXT_PUBLIC_FIREBASE_* env vars. See .env.local.example.");
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resolves the one-time "no Firebase config" loading state, not derived render state
      setLoading(false);
      return;
    }
    return onAuthStateChanged(firebaseAuth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        hasSignedInRef.current = true;
        await syncAppUser();
      } else {
        setAppUser(null);
        setNeedsOnboarding(false);
        if (!hasSignedInRef.current && isFirstLoadThisTab()) {
          setIsNewVisitor(true);
        }
      }
      setLoading(false);
    });
  }, [syncAppUser]);

  return (
    <AuthContext.Provider value={{ firebaseUser, appUser, loading, needsOnboarding, refreshAppUser: syncAppUser, isNewVisitor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
