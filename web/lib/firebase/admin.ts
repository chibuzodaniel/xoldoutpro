import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";

// FIREBASE_SERVICE_ACCOUNT_KEY holds the full service-account JSON (single-line,
// base64 or raw). Never commit it — see .env.local.example.
function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set. See .env.local.example.");
  }
  const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(json);
}

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length) return existing[0];
  return initializeApp({ credential: cert(loadServiceAccount()) });
}

export const adminAuth = () => getAuth(getAdminApp());
export const adminMessaging = () => getMessaging(getAdminApp());

/** Verifies a Firebase ID token sent from the client (Authorization: Bearer <token>). */
export async function verifyFirebaseIdToken(idToken: string) {
  return adminAuth().verifyIdToken(idToken);
}
