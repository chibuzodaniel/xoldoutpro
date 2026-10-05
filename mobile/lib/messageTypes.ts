// Shapes returned by /api/messages (web lib/messages) — a copy of web's
// components/messages/types.ts for the mobile Messages screens.

export type DmPerson = { id: string; handle: string; displayName: string; avatarUrl: string | null; isVerified?: boolean };

export type DmConversationRow = {
  id: string;
  other: DmPerson | null;
  lastMessage: { fromMe: boolean; preview: string; createdAt: string } | null;
  unread: number;
  lastMessageAt: string;
};

export type DmShareCard = {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  href: string;
  status?: string;
};

export type DmMessage = {
  id: string;
  fromMe: boolean;
  kind: "TEXT" | "IMAGE" | "SHARE" | "SYSTEM";
  body: string | null;
  imageUrl: string | null;
  share: DmShareCard | null;
  deleted: boolean;
  createdAt: string;
  expiresAt: string | null;
};

export type DmThread = {
  id: string;
  other: DmPerson;
  myStatus: "ACTIVE" | "REQUEST";
  otherStatus: "ACTIVE" | "REQUEST";
  waitingForAccept: boolean;
  blockedByMe: boolean;
  blockedMe: boolean;
  otherLastReadAt: string | null;
  disappear: {
    seconds: number | null;
    label: string;
    pending: { seconds: number; label: string; byMe: boolean } | null;
  };
  messages: DmMessage[];
  serverTime: string;
};

export const DISAPPEAR_CHOICES: { seconds: number; label: string }[] = [
  { seconds: 86_400, label: "24 hours" },
  { seconds: 604_800, label: "1 week" },
  { seconds: 2_592_000, label: "1 month" },
  { seconds: 7_776_000, label: "3 months" },
];

export type DmShareTarget = { type: "PRODUCT" | "EVENT" | "LIVE"; id: string };
