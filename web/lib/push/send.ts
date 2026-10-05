import { adminMessaging } from "@/lib/firebase/admin";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  /**
   * Groups related alerts: a newer push with the same tag replaces the older
   * one on screen but still re-alerts (sound/vibration) — e.g. one entry per
   * Fanbase or per post instead of a tray full of duplicates. Untagged
   * pushes each get their own entry.
   */
  tag?: string;
};

// The Android channel every push is delivered on — created by the mobile app
// (mobile/lib/push.ts) with HIGH importance: heads-up banner, sound,
// vibration. Must match that id exactly.
const ANDROID_CHANNEL_ID = "alerts";

// User.fcmTokens holds two different token formats side by side: real FCM
// registration tokens (web) and Expo push tokens (mobile — expo-notifications'
// getExpoPushTokenAsync(), not a native FCM/APNs token; see mobile's
// lib/push.ts for why Expo's own push service was used instead of standing
// up native Firebase Messaging for iOS). Each format needs its own send API,
// so every token is routed by shape before anything goes out.
const EXPO_TOKEN_PATTERN = /^Expo(nent)?PushToken\[.+\]$/;

// Provider limits per request: Expo accepts 100 messages, FCM sendEach 500.
const EXPO_BATCH = 100;
const FCM_BATCH = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Outgoing = { token: string; payload: PushPayload; badge: number };

async function sendExpo(all: Outgoing[]): Promise<Set<string>> {
  const dead = new Set<string>();
  for (const batch of chunk(all, EXPO_BATCH)) for (const t of await sendExpoBatch(batch)) dead.add(t);
  return dead;
}

async function sendExpoBatch(messages: Outgoing[]): Promise<Set<string>> {
  if (messages.length === 0) return new Set();
  const dead = new Set<string>();
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      // Unlike the FCM branch below, this carries top-level title/body —
      // there's no service worker on native to double-display it; Expo's
      // push service is what shows the system notification here.
      // Persistent + loud by design (explicit ask): high priority (heads-up,
      // wakes the device), default sound, the HIGH-importance Android
      // channel, and the unread count on the app icon. `data.url` rides
      // along for the tap-to-open deep link.
      body: JSON.stringify(
        messages.map(({ token, payload, badge }) => ({
          to: token,
          title: payload.title,
          body: payload.body,
          sound: "default",
          priority: "high",
          channelId: ANDROID_CHANNEL_ID,
          badge,
          ...(payload.tag ? { collapseId: payload.tag } : {}),
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
      if (r.details?.error === "DeviceNotRegistered") dead.add(messages[i].token);
    });
  } catch {
    // Push is best-effort — never let a delivery failure break the caller.
  }
  return dead;
}

async function sendFcm(all: Outgoing[]): Promise<Set<string>> {
  const dead = new Set<string>();
  for (const batch of chunk(all, FCM_BATCH)) for (const t of await sendFcmBatch(batch)) dead.add(t);
  return dead;
}

async function sendFcmBatch(messages: Outgoing[]): Promise<Set<string>> {
  if (messages.length === 0) return new Set();
  const dead = new Set<string>();
  try {
    // Data-only, deliberately no top-level `notification` field — when a
    // background push carries one, the browser auto-displays it itself
    // *and* the service worker's onBackgroundMessage handler displays it
    // again, showing the same notification twice. Data-only means our SW
    // (public/firebase-messaging-sw.js) is the only thing that ever calls
    // showNotification() — which is also where persistence (stays on screen
    // until the user acts) is applied. Urgency "high" asks the browser's push
    // service to deliver immediately rather than batching.
    const response = await adminMessaging().sendEach(
      messages.map(({ token, payload, badge }) => ({
        token,
        data: {
          title: payload.title,
          body: payload.body,
          badge: String(badge),
          ...(payload.url ? { url: payload.url } : {}),
          ...(payload.icon ? { icon: payload.icon } : {}),
          ...(payload.tag ? { tag: payload.tag } : {}),
        },
        webpush: { headers: { Urgency: "high", TTL: String(4 * 24 * 60 * 60) } },
      })),
    );
    response.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error?.code;
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
        dead.add(messages[i].token);
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
// eligibility first. Each recipient's message carries their own unread bell
// count, shown as the app-icon badge.
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;

  const recipients = await db.user.findMany({
    where: { id: { in: ids }, pushEnabled: true, fcmTokens: { isEmpty: false } },
    select: { id: true, fcmTokens: true },
  });
  if (recipients.length === 0) return;

  const unread = await db.notification.groupBy({
    by: ["userId"],
    where: { userId: { in: recipients.map((r) => r.id) }, seenAt: null },
    _count: { _all: true },
  });
  const badgeFor = new Map(unread.map((u) => [u.userId, u._count._all]));
  // The app-icon badge also counts direct-message conversations with unread
  // messages (explicit ask, 2026-10-05), not just unseen bell notifications.
  const recipientIds = recipients.map((r) => r.id);
  const dmUnread = await db.$queryRaw<{ userId: string; n: bigint }[]>`
    SELECT p."userId", COUNT(DISTINCT p."conversationId") AS n
    FROM "ConversationParticipant" p
    JOIN "DirectMessage" m ON m."conversationId" = p."conversationId"
    WHERE p."userId" IN (${Prisma.join(recipientIds)})
      AND m."senderId" <> p."userId"
      AND m."kind" <> 'SYSTEM'
      AND m."createdAt" > COALESCE(p."lastReadAt", TIMESTAMP 'epoch')
      AND (m."expiresAt" IS NULL OR m."expiresAt" > now())
    GROUP BY p."userId"
  `.catch(() => []);
  for (const row of dmUnread) badgeFor.set(row.userId, (badgeFor.get(row.userId) ?? 0) + Number(row.n));

  const tokenToUser = new Map<string, string>();
  const outgoing: Outgoing[] = [];
  for (const r of recipients) {
    for (const token of r.fcmTokens) {
      tokenToUser.set(token, r.id);
      outgoing.push({ token, payload, badge: badgeFor.get(r.id) ?? 0 });
    }
  }
  if (outgoing.length === 0) return;

  const [deadExpo, deadFcm] = await Promise.all([
    sendExpo(outgoing.filter((m) => EXPO_TOKEN_PATTERN.test(m.token))),
    sendFcm(outgoing.filter((m) => !EXPO_TOKEN_PATTERN.test(m.token))),
  ]);
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
