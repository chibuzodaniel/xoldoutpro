import { getApps, getApp, initializeApp } from "firebase/app";
// @ts-expect-error -- getReactNativePersistence exists at runtime (firebase/auth's
// React Native entry point) but isn't in the package's public .d.ts yet.
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Same project as web (lib/firebase/client.ts) — these are Firebase's public
// client config values (restricted by Firebase security rules, not secrecy),
// safe to duplicate here rather than share via env vars across two apps.
const firebaseConfig = {
  apiKey: "AIzaSyBF4E3ujQP_Mub5AcRiU5kkBDejmaf2OJc",
  authDomain: "auth.xoldout.app",
  projectId: "xoldoutpro",
  storageBucket: "xoldoutpro.firebasestorage.app",
  messagingSenderId: "886163264722",
  appId: "1:886163264722:web:1014432e2c7d44127f490b",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Without explicit AsyncStorage persistence, firebase/auth defaults to
// in-memory-only on React Native — a signed-in user would be logged out on
// every app restart. initializeAuth() throws if called twice for the same
// app (e.g. this module re-evaluating under Fast Refresh), so fall back to
// getAuth() — which returns the already-initialized instance — instead of
// crashing.
export const firebaseAuth = (() => {
  try {
    return initializeAuth(firebaseApp, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    return getAuth(firebaseApp);
  }
})();
