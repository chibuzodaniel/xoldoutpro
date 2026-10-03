import { getToken } from "firebase/messaging";
import { getFirebaseMessaging } from "@/lib/firebase/client";
import { apiFetch } from "@/lib/api";

type PushResult = { ok: true } | { ok: false; error: string };

/** This browser's current notification permission, or null where push isn't supported at all. */
export function pushPermission(): NotificationPermission | null {
  if (typeof window === "undefined" || !("Notification" in window)) return null;
  return Notification.permission;
}

/**
 * Gets this browser's FCM token and adds it to the account's device list
 * (POST /api/me/push-devices — appends, never replaces, so a phone and a
 * laptop both stay registered). Assumes permission is already granted.
 */
async function registerThisDevice(): Promise<PushResult> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) return { ok: false, error: "Push notifications aren't configured yet." };

  const messaging = await getFirebaseMessaging();
  if (!messaging) return { ok: false, error: "Push isn't supported in this browser." };

  try {
    const token = await getToken(messaging, { vapidKey });
    const res = await apiFetch("/api/me/push-devices", { method: "POST", body: JSON.stringify({ token }) });
    if (!res.ok) return { ok: false, error: "Could not save your device for push." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not register this device for push." };
  }
}

/** Asks for notification permission (if needed) and registers this device. The Edit Profile toggle and onboarding call this. */
export async function enablePush(): Promise<PushResult> {
  if (pushPermission() === null) return { ok: false, error: "Push isn't supported in this browser." };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, error: "Notification permission was denied." };
  return registerThisDevice();
}

/** Registers this device only if permission was already granted — never prompts. */
export async function registerIfAlreadyPermitted(): Promise<PushResult | null> {
  if (pushPermission() !== "granted") return null;
  return registerThisDevice();
}

type ForegroundPush = { title?: string; body?: string; url?: string; icon?: string; tag?: string; badge?: string };

/**
 * FCM hands pushes that arrive while the page is open and focused to the
 * page (onMessage), NOT the service worker — previously nothing listened,
 * so those were silently dropped. This shows them anyway (through the
 * service worker, so they look and persist exactly like background ones)
 * and lets the caller react in-app too. Returns an unsubscribe function.
 */
export async function listenForForegroundPush(onPush: (data: ForegroundPush) => void): Promise<() => void> {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return () => {};
  const { onMessage } = await import("firebase/messaging");
  return onMessage(messaging, async (payload) => {
    const data = (payload.data ?? {}) as ForegroundPush;
    onPush(data);
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const sw = registrations.find((r) => r.active?.scriptURL.endsWith("/firebase-messaging-sw.js"))?.active;
      sw?.postMessage({ type: "xo-show", data });
    } catch {
      // no service worker yet — the in-app toast still shows
    }
  });
}
