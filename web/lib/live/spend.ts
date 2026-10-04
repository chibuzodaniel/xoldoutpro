// The three ways XG actually moves during a Live (write-up §2/§3: Xoldout
// Gifts, Paid Access, Paid Requests) — each debits the spender's
// CoinLedgerEntry and credits the creator's earned-XG balance in the same
// transaction (lib/live/coins.ts's debitCoins, lib/live/xgEarnings.ts's
// creditCreatorXg — converted to withdrawable Naira monthly),
// then broadcasts a LiveKit data message so it animates instantly for
// everyone watching. The debit+credit committing is the source of truth;
// the broadcast is just UI — never the other way around (see
// publishLiveEvent's own comment).

import { db } from "@/lib/db";
import { debitCoins, InsufficientCoinsError } from "@/lib/live/coins";
import { creditCreatorXg } from "@/lib/live/xgEarnings";
import { publishLiveEvent } from "@/lib/live/liveKit";

export { InsufficientCoinsError };

// Fixed catalog for v1 — mirrors the mockup exactly. Lives in code, not the
// DB (see prisma/schema.prisma's LiveGiftType comment).
export const GIFT_CATALOG = {
  STAR: { xgAmount: 10, label: "Star" },
  MIC: { xgAmount: 50, label: "Mic" },
  MONEY_SPRAY: { xgAmount: 200, label: "Money Spray" },
  GRAMMY: { xgAmount: 500, label: "Grammy" },
} as const;

export type GiftType = keyof typeof GIFT_CATALOG;

export class LiveSessionNotFoundError extends Error {}
export class LiveSessionEndedError extends Error {}
export class CannotGiftOwnLiveError extends Error {}

async function loadLiveSession(liveSessionId: string) {
  const session = await db.liveSession.findUnique({ where: { id: liveSessionId } });
  if (!session) throw new LiveSessionNotFoundError();
  if (session.status !== "LIVE" || !session.roomName) throw new LiveSessionEndedError();
  return { ...session, roomName: session.roomName };
}

export async function sendLiveGift(args: { liveSessionId: string; senderId: string; giftType: GiftType }) {
  const session = await loadLiveSession(args.liveSessionId);
  if (session.creatorId === args.senderId) throw new CannotGiftOwnLiveError();
  const { xgAmount, label } = GIFT_CATALOG[args.giftType];

  const [gift, sender] = await db.$transaction(async (tx) => {
    await debitCoins(tx, args.senderId, xgAmount, "GIFT_DEBIT");
    await creditCreatorXg(tx, { creatorId: session.creatorId, xgAmount, source: "LIVE_GIFT", liveSessionId: args.liveSessionId });
    const gift = await tx.liveGift.create({
      data: { liveSessionId: args.liveSessionId, senderId: args.senderId, type: args.giftType, xgAmount },
    });
    const sender = await tx.user.findUniqueOrThrow({ where: { id: args.senderId }, select: { displayName: true } });
    return [gift, sender];
  });

  await publishLiveEvent(session.roomName, {
    kind: "gift",
    giftId: gift.id,
    giftType: args.giftType,
    label,
    xgAmount,
    senderId: args.senderId,
    senderName: sender.displayName,
    createdAt: gift.createdAt.toISOString(),
  });

  return gift;
}

export class LiveAccessNotPaidError extends Error {}
export class AlreadyHasAccessError extends Error {}

/** Buys (or confirms free) entry to a paid Live — one grant per (session, viewer), never re-charged on a re-join. */
export async function buyLiveAccess(args: { liveSessionId: string; userId: string }) {
  const session = await loadLiveSession(args.liveSessionId);
  if (session.creatorId === args.userId) return null; // the creator always has access to their own Live

  const existing = await db.liveAccessGrant.findUnique({
    where: { liveSessionId_userId: { liveSessionId: args.liveSessionId, userId: args.userId } },
  });
  if (existing) throw new AlreadyHasAccessError();
  if (!session.isPaidAccess || session.priceXg <= 0) throw new LiveAccessNotPaidError();

  return db.$transaction(async (tx) => {
    await debitCoins(tx, args.userId, session.priceXg, "PAID_ACCESS_DEBIT");
    await creditCreatorXg(tx, {
      creatorId: session.creatorId,
      xgAmount: session.priceXg,
      source: "LIVE_ACCESS",
      liveSessionId: args.liveSessionId,
    });
    return tx.liveAccessGrant.create({
      data: { liveSessionId: args.liveSessionId, userId: args.userId, xgPaid: session.priceXg },
    });
  });
}

export async function hasLiveAccess(liveSessionId: string, userId: string): Promise<boolean> {
  const grant = await db.liveAccessGrant.findUnique({
    where: { liveSessionId_userId: { liveSessionId, userId } },
  });
  return grant !== null;
}

const MIN_REQUEST_XG = 10;

export async function submitLiveRequest(args: { liveSessionId: string; senderId: string; message: string; xgAmount: number }) {
  const session = await loadLiveSession(args.liveSessionId);
  if (session.creatorId === args.senderId) throw new CannotGiftOwnLiveError();
  const xgAmount = Math.max(MIN_REQUEST_XG, Math.round(args.xgAmount));

  const [request, sender] = await db.$transaction(async (tx) => {
    await debitCoins(tx, args.senderId, xgAmount, "PAID_REQUEST_DEBIT");
    await creditCreatorXg(tx, { creatorId: session.creatorId, xgAmount, source: "LIVE_REQUEST", liveSessionId: args.liveSessionId });
    const request = await tx.liveRequest.create({
      data: { liveSessionId: args.liveSessionId, senderId: args.senderId, message: args.message.slice(0, 500), xgAmount },
    });
    const sender = await tx.user.findUniqueOrThrow({ where: { id: args.senderId }, select: { displayName: true } });
    return [request, sender];
  });

  await publishLiveEvent(session.roomName, {
    kind: "request",
    requestId: request.id,
    message: request.message,
    xgAmount,
    senderId: args.senderId,
    senderName: sender.displayName,
    createdAt: request.createdAt.toISOString(),
  });

  return request;
}

export class LiveRequestNotFoundError extends Error {}
export class LiveRequestNotOwnedError extends Error {}
export class LiveRequestNotPendingError extends Error {}

/** Creator accepts/declines a request from their own moderation queue — money already moved at submit time, this is status-only. */
export async function respondToLiveRequest(args: { requestId: string; creatorId: string; accept: boolean }) {
  const request = await db.liveRequest.findUnique({ where: { id: args.requestId }, include: { liveSession: true } });
  if (!request) throw new LiveRequestNotFoundError();
  if (request.liveSession.creatorId !== args.creatorId) throw new LiveRequestNotOwnedError();
  if (request.status !== "PENDING") throw new LiveRequestNotPendingError();

  return db.liveRequest.update({
    where: { id: args.requestId },
    data: { status: args.accept ? "ACCEPTED" : "DECLINED" },
  });
}
