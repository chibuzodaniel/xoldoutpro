"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";
import { apiFetch } from "@/lib/api";

export type SocialLink = { platform: "Instagram" | "X" | "TikTok" | "YouTube" | "Website"; url: string };

export type AppUser = {
  id: string;
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
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

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
        await syncAppUser();
      } else {
        setAppUser(null);
        setNeedsOnboarding(false);
      }
      setLoading(false);
    });
  }, [syncAppUser]);

  return (
    <AuthContext.Provider value={{ firebaseUser, appUser, loading, needsOnboarding, refreshAppUser: syncAppUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
