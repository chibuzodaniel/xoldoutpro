import { after } from "next/server";
import { db } from "@/lib/db";
import { sendPushToUsers } from "@/lib/push/send";

export type NotificationKind =
  | "SALE"
  | "ORDER_PAID"
  | "PAYOUT_INITIATED"
  | "PAYOUT_FAILED"
  | "PAYOUT_PAID"
  | "REFUND"
  | "MODERATION"
  | "FOLLOW"
  | "LIKE"
  | "COMMENT"
  | "FANBASE"
  | "REMINDER"
  | "VERIFICATION"
  | "LIVE";

type NotifyArgs = { kind: NotificationKind; title: string; body: string; url?: string; icon?: string; tag?: string };

/**
 * Every notification is persistent (explicit ask): it's saved to the header
 * bell (Notification row) *and* pushed to every registered device — a push
 * that's missed, dismissed or never delivered is still waiting in the bell.
 * The push itself is also built to stay on screen until the user acts on it
 * (see lib/push/send.ts and public/firebase-messaging-sw.js).
 */
export async function notifyUsers(userIds: string[], args: NotifyArgs): Promise<void> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  await db.notification.createMany({
    data: ids.map((userId) => ({ userId, kind: args.kind, title: args.title, body: args.body, url: args.url })),
  });
  await sendPushToUsers(ids, { title: args.title, body: args.body, url: args.url, icon: args.icon, tag: args.tag });
}

export async function createNotification(userId: string, args: NotifyArgs) {
  await notifyUsers([userId], args);
}

/**
 * For API routes: notifies after the response has been sent (next/server's
 * after()), so the person who liked/followed/posted never waits on the
 * fan-out — while Vercel still keeps the function alive until delivery is
 * done. The previous social pushes were bare un-awaited promises, which
 * Vercel can freeze mid-flight once the response goes out (the same bug that
 * broke Live peak-viewer counts), so many were never actually sent.
 */
export function notifyUsersAfterResponse(userIds: string[], args: NotifyArgs): void {
  const run = () => notifyUsers(userIds, args).catch((err) => console.error("notifyUsers failed", err));
  try {
    after(run);
  } catch {
    void run();
  }
}
