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
import type { AppUser } from "./authTypes";

type AuthState = {
  firebaseUser: FirebaseUser | null;
  appUser: AppUser | null;
  loading: boolean;
  needsOnboarding: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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

  return (
    <AuthContext.Provider value={{ firebaseUser, appUser, loading, needsOnboarding, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
