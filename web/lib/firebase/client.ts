"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Guarded so a build/SSR pass with no NEXT_PUBLIC_FIREBASE_* env vars set
// (e.g. before the Firebase project is provisioned) doesn't crash — Firebase
// JS SDK validates the API key format synchronously at getAuth() time, even
// with no network call. AuthProvider treats a null firebaseAuth as "signed
// out" and logs a warning instead of hard-failing.
export const firebaseConfigured = Boolean(firebaseConfig.apiKey);

export const firebaseApp: FirebaseApp | null = firebaseConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const firebaseAuth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;
export const googleProvider = new GoogleAuthProvider();

// Messaging only works in a browser with service-worker support; guard for SSR.
export async function getFirebaseMessaging() {
  if (typeof window === "undefined" || !firebaseApp || !(await isSupported())) return null;
  return getMessaging(firebaseApp);
}
