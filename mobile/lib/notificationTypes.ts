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

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
  // Set when the notification points at a Live — its current status.
  liveStatus?: "LIVE" | "ENDED" | "SCHEDULED";
};
