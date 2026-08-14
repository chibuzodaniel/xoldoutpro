import { getToken } from "firebase/messaging";
import { getFirebaseMessaging } from "@/lib/firebase/client";
import { apiFetch } from "@/lib/api";

/**
 * Registers this device for push and flips User.pushEnabled on. No actual
 * push-sending code exists yet (see DECISIONS.md) — this only gets the
 * device to a registered state so that work can be wired in later without
 * touching the client again.
 */
export async function enablePush(): Promise<{ ok: true } | { ok: false; error: string }> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) return { ok: false, error: "Push notifications aren't configured yet." };

  const messaging = await getFirebaseMessaging();
  if (!messaging) return { ok: false, error: "Push isn't supported in this browser." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, error: "Notification permission was denied." };

  try {
    const token = await getToken(messaging, { vapidKey });
    const res = await apiFetch("/api/me", {
      method: "PATCH",
      body: JSON.stringify({ pushEnabled: true, fcmTokens: [token] }),
    });
    if (!res.ok) return { ok: false, error: "Could not save your device for push." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not register this device for push." };
  }
}

export async function disablePush(): Promise<void> {
  await apiFetch("/api/me", { method: "PATCH", body: JSON.stringify({ pushEnabled: false, fcmTokens: [] }) });
}
