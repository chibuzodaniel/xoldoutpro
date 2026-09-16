import { db } from "@/lib/db";
import { sendPushToUser } from "@/lib/push/send";

type NotificationKind = "SALE" | "ORDER_PAID" | "PAYOUT_INITIATED" | "PAYOUT_FAILED" | "PAYOUT_PAID" | "REFUND";

// The header bell's data source (transactional/money events) — every call
// also pushes to the user's registered devices via lib/push/send.ts, so a
// caller never needs to remember to trigger both separately. sendPushToUser
// itself no-ops for users with pushEnabled=false or no tokens.
export async function createNotification(userId: string, args: { kind: NotificationKind; title: string; body: string; url?: string }) {
  await db.notification.create({
    data: { userId, kind: args.kind, title: args.title, body: args.body, url: args.url },
  });
  await sendPushToUser(userId, { title: args.title, body: args.body, url: args.url });
}
