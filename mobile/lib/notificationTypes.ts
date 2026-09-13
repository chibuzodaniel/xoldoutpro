export type NotificationKind = "SALE" | "ORDER_PAID" | "PAYOUT_INITIATED" | "PAYOUT_FAILED" | "PAYOUT_PAID" | "REFUND";

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
};
