import { adminMessaging } from "@/lib/firebase/admin";
import { db } from "@/lib/db";

type PushPayload = { title: string; body: string; url?: string; icon?: string };

// User.fcmTokens holds two different token formats side by side: real FCM
// registration tokens (web) and Expo push tokens (mobile — expo-notifications'
// getExpoPushTokenAsync(), not a native FCM/APNs token; see mobile's
// lib/push.ts for why Expo's own push service was used instead of standing
// up native Firebase Messaging for iOS). Each format needs its own send API,
// so every token is routed by shape before anything goes out.
const EXPO_TOKEN_PATTERN = /^Expo(nent)?PushToken\[.+\]$/;

async function sendExpoTokens(tokens: string[], payload: PushPayload): Promise<Set<string>> {
  if (tokens.length === 0) return new Set();
  const dead = new Set<string>();
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      // Unlike the FCM branch below, this carries top-level title/body —
      // there's no service worker on native to double-display it (that's
      // what made the web branch go data-only); Expo's push service is
      // what shows the system notification here, nothing on-device has to.
      // `data.url` still rides along for the tap-to-open deep link.
      body: JSON.stringify(
        tokens.map((to) => ({
          to,
          title: payload.title,
          body: payload.body,
          data: {
            ...(payload.url ? { url: payload.url } : {}),
            ...(payload.icon ? { icon: payload.icon } : {}),
          },
        })),
      ),
    });
    const json: { data?: { status: string; details?: { error?: string } }[] } = await res.json();
    json.data?.forEach((r, i) => {
      if (r.status !== "error") return;
      if (r.details?.error === "DeviceNotRegistered") dead.add(tokens[i]);
    });
  } catch {
    // Push is best-effort — never let a delivery failure break the caller.
  }
  return dead;
}

async function sendFcmTokens(tokens: string[], payload: PushPayload): Promise<Set<string>> {
  if (tokens.length === 0) return new Set();
  const dead = new Set<string>();
  try {
    // Data-only, deliberately no top-level `notification` field — when a
    // background push carries one, the browser auto-displays it itself
    // *and* the service worker's onBackgroundMessage handler displays it
    // again, showing the same notification twice. Data-only means our SW is
    // the only thing that ever calls showNotification().
    const response = await adminMessaging().sendEachForMulticast({
      tokens,
      data: {
        title: payload.title,
        body: payload.body,
        ...(payload.url ? { url: payload.url } : {}),
        ...(payload.icon ? { icon: payload.icon } : {}),
      },
    });
    response.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error?.code;
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
        dead.add(tokens[i]);
      }
    });
  } catch {
    // Push is best-effort — a misconfigured project (e.g. no VAPID key yet)
    // shouldn't break the API route that triggered this.
  }
  return dead;
}

// Sends to every device token a user has registered (User.fcmTokens), and
// prunes tokens either service reports as dead (unregistered/invalid) so
// they don't keep failing on every future send. Silently no-ops for users
// with pushEnabled=false or no tokens — this is meant to be called
// opportunistically from API routes without the caller needing to check
// eligibility first.
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;

  const recipients = await db.user.findMany({
    where: { id: { in: ids }, pushEnabled: true, fcmTokens: { isEmpty: false } },
    select: { id: true, fcmTokens: true },
  });
  if (recipients.length === 0) return;

  const tokenToUser = new Map<string, string>();
  for (const r of recipients) for (const t of r.fcmTokens) tokenToUser.set(t, r.id);
  const allTokens = [...tokenToUser.keys()];
  if (allTokens.length === 0) return;

  const expoTokens = allTokens.filter((t) => EXPO_TOKEN_PATTERN.test(t));
  const fcmTokens = allTokens.filter((t) => !EXPO_TOKEN_PATTERN.test(t));

  const [deadExpo, deadFcm] = await Promise.all([sendExpoTokens(expoTokens, payload), sendFcmTokens(fcmTokens, payload)]);
  const deadTokens = new Set([...deadExpo, ...deadFcm]);
  if (deadTokens.size === 0) return;

  const deadTokensByUser = new Map<string, string[]>();
  for (const token of deadTokens) {
    const userId = tokenToUser.get(token);
    if (!userId) continue;
    const cur = deadTokensByUser.get(userId) ?? [];
    cur.push(token);
    deadTokensByUser.set(userId, cur);
  }

  await Promise.all(
    [...deadTokensByUser.entries()].map(([userId, tokensToRemove]) => {
      const user = recipients.find((r) => r.id === userId);
      if (!user) return null;
      return db.user.update({
        where: { id: userId },
        data: { fcmTokens: user.fcmTokens.filter((t) => !tokensToRemove.includes(t)) },
      });
    }),
  );
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  return sendPushToUsers([userId], payload);
}
