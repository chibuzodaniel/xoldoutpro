import { db } from "@/lib/db";

type NotificationKind = "SALE" | "ORDER_PAID" | "PAYOUT_INITIATED" | "PAYOUT_FAILED" | "REFUND";

// The header bell's data source — transactional/money events only. Deliberately
// separate from lib/push/send.ts (device push) and lib/socials/unread.ts (the
// Socials tab's in-app badge): three independent signals, not layered on top
// of each other. A caller that wants both a push and a bell entry for the
// same event calls both helpers explicitly, side by side.
export async function createNotification(userId: string, args: { kind: NotificationKind; title: string; body: string; url?: string }) {
  await db.notification.create({
    data: { userId, kind: args.kind, title: args.title, body: args.body, url: args.url },
  });
}
