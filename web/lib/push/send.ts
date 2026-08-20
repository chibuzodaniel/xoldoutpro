import { adminMessaging } from "@/lib/firebase/admin";
import { db } from "@/lib/db";

type PushPayload = { title: string; body: string; url?: string };

// Sends to every device token a user has registered (User.fcmTokens), and
// prunes tokens FCM reports as dead (unregistered/invalid) so they don't
// keep failing on every future send. Silently no-ops for users with
// pushEnabled=false or no tokens — this is meant to be called opportunistically
// from API routes without the caller needing to check eligibility first.
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
  const tokens = [...tokenToUser.keys()];
  if (tokens.length === 0) return;

  let response;
  try {
    response = await adminMessaging().sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.url ? { url: payload.url } : undefined,
      webpush: { fcmOptions: payload.url ? { link: payload.url } : undefined },
    });
  } catch {
    // Push is best-effort — a misconfigured project (e.g. no VAPID key yet)
    // shouldn't break the API route that triggered this.
    return;
  }

  const deadTokensByUser = new Map<string, string[]>();
  response.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code;
    if (code !== "messaging/registration-token-not-registered" && code !== "messaging/invalid-registration-token") return;
    const token = tokens[i];
    const userId = tokenToUser.get(token);
    if (!userId) return;
    const cur = deadTokensByUser.get(userId) ?? [];
    cur.push(token);
    deadTokensByUser.set(userId, cur);
  });

  await Promise.all(
    [...deadTokensByUser.entries()].map(([userId, deadTokens]) => {
      const user = recipients.find((r) => r.id === userId);
      if (!user) return null;
      return db.user.update({
        where: { id: userId },
        data: { fcmTokens: user.fcmTokens.filter((t) => !deadTokens.includes(t)) },
      });
    }),
  );
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  return sendPushToUsers([userId], payload);
}
