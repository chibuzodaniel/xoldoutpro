"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
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
  isModerator: boolean;
  isSuperModerator: boolean;
  isVerified: boolean;
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
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const syncAppUser = useCallback(async () => {
    const res = await apiFetch("/api/auth/sync", { method: "POST" });
    if (!res.ok) return;
    const data = await res.json();
    setAppUser(data.user);
    setNeedsOnboarding(Boolean(data.needsOnboarding));
  }, []);

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
