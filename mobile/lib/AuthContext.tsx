import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { firebaseAuth } from "./firebase";
import { apiPost } from "./api";
import { enablePush } from "./push";
import type { AppUser } from "./authTypes";

type AuthState = {
  firebaseUser: FirebaseUser | null;
  appUser: AppUser | null;
  loading: boolean;
  needsOnboarding: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAppUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const syncAppUser = useCallback(async (user: FirebaseUser) => {
    const idToken = await user.getIdToken();
    const data = await apiPost<{ user: AppUser; needsOnboarding?: boolean; accountDeleted?: boolean }>(
      "/api/auth/sync",
      idToken,
    );
    setAppUser(data.accountDeleted ? null : data.user);
    setNeedsOnboarding(Boolean(data.needsOnboarding));

    // Notifications are on by default now — there's no in-app toggle, so
    // this is the only place push ever gets (re-)registered. Fire-and-forget:
    // a denied OS permission or an Expo Go build without push support should
    // never block sign-in.
    if (data.user && !data.user.pushEnabled) {
      enablePush(user).catch(() => {});
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await syncAppUser(user);
      } else {
        setAppUser(null);
        setNeedsOnboarding(false);
      }
      setLoading(false);
    });
  }, [syncAppUser]);

  async function login(email: string, password: string) {
    await signInWithEmailAndPassword(firebaseAuth, email, password);
  }

  async function signup(email: string, password: string) {
    await createUserWithEmailAndPassword(firebaseAuth, email, password);
  }

  async function logout() {
    await firebaseSignOut(firebaseAuth);
  }

  // Re-fetches appUser without a full auth round-trip — used after editing
  // profile fields, avatar/cover, or anything else /api/me can mutate, so
  // the UI reflects the change immediately instead of waiting for the next
  // onAuthStateChanged firing (which normally doesn't fire again at all
  // until the next sign-in).
  async function refreshAppUser() {
    if (!firebaseUser) return;
    await syncAppUser(firebaseUser);
  }

  return (
    <AuthContext.Provider value={{ firebaseUser, appUser, loading, needsOnboarding, login, signup, logout, refreshAppUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
