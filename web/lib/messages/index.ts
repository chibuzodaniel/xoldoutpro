// Direct messages (explicit ask, 2026-10-04: "let's introduce direct
// messages"). One-to-one only. The rules, all enforced here rather than in
// the routes or clients:
//
//  - Requests (like Instagram): a first message from someone the recipient
//    doesn't follow lands in their Requests; the sender can't send another
//    until it's accepted. Replying accepts automatically.
//  - Blocks: if either person has blocked the other, nothing can be sent
//    and the blocker no longer sees the conversation.
//  - Read receipts: each participant's lastReadAt; the other person's
//    lastReadAt past your newest message means "Seen".
//  - Delete for everyone: the sender clears a message's content; it reads
//    "Message deleted".
//  - Disappearing messages (like WhatsApp, but with consent): either person
//    proposes 24 hours / 1 week / 1 month / 3 months or "off"; it only takes
//    effect once the other person approves. New messages then expire after
//    that long and are hidden immediately, purged daily.
//
// Delivery is by short-interval refreshing while a conversation is open,
// plus a push notification for each new message (or new request).

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { sendPushToUsers } from "@/lib/push/send";

export const DISAPPEAR_OPTIONS = {
  86_400: "24 hours",
  604_800: "1 week",
  2_592_000: "1 month",
  7_776_000: "3 months",
} as const;
export type DisappearSeconds = keyof typeof DISAPPEAR_OPTIONS;

export function disappearLabel(seconds: number | null | undefined) {
  return seconds ? (DISAPPEAR_OPTIONS[seconds as DisappearSeconds] ?? `${Math.round(seconds / 86_400)} days`) : "Off";
}

export class MessageError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export type ShareTarget = { type: "PRODUCT" | "EVENT" | "LIVE"; id: string };
export type OutgoingMessage =
  | { kind: "TEXT"; body: string }
  | { kind: "IMAGE"; imageUrl: string; body?: string }
  | { kind: "SHARE"; share: ShareTarget; body?: string };

const MAX_BODY = 2000;
const PAGE_SIZE = 50;

export function pairKeyFor(a: string, b: string) {
  return [a, b].sort().join(":");
}

async function blockedEitherWay(a: string, b: string) {
  const count = await db.userBlock.count({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
  });
  return count > 0;
}

function notExpired(now = new Date()): Prisma.DirectMessageWhereInput {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

async function loadParticipant(conversationId: string, userId: string) {
  const me = await db.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    include: { conversation: { include: { participants: true } } },
  });
  if (!me) throw new MessageError("Conversation not found", 404);
  const other = me.conversation.participants.find((p) => p.userId !== userId);
  if (!other) throw new MessageError("Conversation not found", 404);
  return { me, other, conversation: me.conversation };
}

// ─── Sending ────────────────────────────────────────────────────────────

async function validateShare(share: ShareTarget) {
  if (share.type === "PRODUCT") {
    const p = await db.product.findUnique({ where: { id: share.id }, select: { status: true, type: true } });
    if (!p || p.status !== "PUBLISHED" || p.type === "EVENT") throw new MessageError("That item can't be shared", 400);
  } else if (share.type === "EVENT") {
    const e = await db.event.findUnique({ where: { id: share.id }, select: { status: true } });
    if (!e || e.status !== "PUBLISHED") throw new MessageError("That event can't be shared", 400);
  } else {
    const l = await db.liveSession.findUnique({ where: { id: share.id }, select: { id: true } });
    if (!l) throw new MessageError("That Live can't be shared", 400);
  }
}

function normalize(message: OutgoingMessage) {
  const body = "body" in message && message.body ? message.body.trim().slice(0, MAX_BODY) : null;
  if (message.kind === "TEXT" && !body) throw new MessageError("Message is empty", 400);
  return {
    kind: message.kind,
    body,
    imageUrl: message.kind === "IMAGE" ? message.imageUrl : null,
    shareType: message.kind === "SHARE" ? message.share.type : null,
    shareId: message.kind === "SHARE" ? message.share.id : null,
  };
}

// Someone whose lastReadAt is this recent has the conversation open right
// now (it refreshes every 3s and marks itself read each time).
const ACTIVELY_VIEWING_MS = 8_000;

/**
 * Push for a new message (explicit ask, 2026-10-05: "full time push and in
 * app notification"). Sent whether the app is closed or open — except when
 * the recipient is looking at this very conversation, or has muted it.
 * In-app banners come separately from latestIncoming() below.
 */
async function notifyNewMessage(args: {
  recipient: { userId: string; lastReadAt: Date | null; mutedUntil: Date | null };
  sender: { displayName: string; avatarUrl: string | null };
  conversationId: string;
  preview: string;
  isRequest: boolean;
}) {
  const now = Date.now();
  if (args.recipient.mutedUntil && args.recipient.mutedUntil.getTime() > now) return;
  if (args.recipient.lastReadAt && now - args.recipient.lastReadAt.getTime() < ACTIVELY_VIEWING_MS) return;
  await sendPushToUsers([args.recipient.userId], {
    title: args.isRequest ? `${args.sender.displayName} wants to send you a message` : args.sender.displayName,
    body: args.isRequest ? "Open your message requests to see it." : args.preview,
    url: `/messages/${args.conversationId}`,
    icon: args.sender.avatarUrl ?? undefined,
    tag: `dm-${args.conversationId}`,
  }).catch((err) => console.error("dm push failed", err));
}

function previewOf(m: { kind: string; body: string | null; shareType: string | null }) {
  if (m.kind === "IMAGE") return m.body ? `📷 ${m.body}` : "📷 Photo";
  if (m.kind === "SHARE") return m.shareType === "LIVE" ? "🔴 Shared a Live" : "🎵 Shared something";
  return m.body ?? "";
}

/** Start (or continue) a conversation with someone by user id and send the first message. */
export async function sendToUser(senderId: string, recipientId: string, message: OutgoingMessage) {
  if (senderId === recipientId) throw new MessageError("You can't message yourself", 400);
  const recipient = await db.user.findUnique({ where: { id: recipientId }, select: { id: true, deletedAt: true } });
  if (!recipient || recipient.deletedAt) throw new MessageError("That account isn't available", 404);

  const pairKey = pairKeyFor(senderId, recipientId);
  let conversation = await db.conversation.findUnique({ where: { pairKey } });
  if (!conversation) {
    // Lands in their inbox if they follow the sender, otherwise in Requests.
    const followsSender = await db.follow.count({ where: { followerId: recipientId, followedId: senderId } });
    conversation = await db.conversation
      .create({
        data: {
          pairKey,
          participants: {
            create: [
              { userId: senderId, status: "ACTIVE", lastReadAt: new Date() },
              { userId: recipientId, status: followsSender ? "ACTIVE" : "REQUEST" },
            ],
          },
        },
      })
      // Both started one at the same instant — use the one that won.
      .catch(async () => db.conversation.findUniqueOrThrow({ where: { pairKey } }));
  }
  return sendMessage(conversation.id, senderId, message);
}

export async function sendMessage(conversationId: string, senderId: string, message: OutgoingMessage) {
  const { me, other, conversation } = await loadParticipant(conversationId, senderId);
  if (await blockedEitherWay(senderId, other.userId)) throw new MessageError("You can't message this person", 403);

  // Replying to a request accepts it.
  if (me.status === "REQUEST") {
    await db.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: senderId } },
      data: { status: "ACTIVE" },
    });
  }
  // One message until they accept.
  if (other.status === "REQUEST") {
    const alreadySent = await db.directMessage.count({ where: { conversationId, senderId, kind: { not: "SYSTEM" } } });
    if (alreadySent > 0) throw new MessageError("They haven't accepted your message request yet", 403);
  }
  if (message.kind === "SHARE") await validateShare(message.share);

  const data = normalize(message);
  const now = new Date();
  const created = await db.$transaction(async (tx) => {
    const m = await tx.directMessage.create({
      data: {
        conversationId,
        senderId,
        ...data,
        expiresAt: conversation.disappearSeconds ? new Date(now.getTime() + conversation.disappearSeconds * 1000) : null,
      },
    });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } });
    await tx.conversationParticipant.updateMany({ where: { conversationId }, data: { hiddenAt: null } });
    await tx.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: senderId } },
      data: { lastReadAt: now },
    });
    return m;
  });

  const sender = await db.user.findUniqueOrThrow({ where: { id: senderId }, select: { displayName: true, avatarUrl: true } });
  await notifyNewMessage({
    recipient: other,
    sender,
    conversationId,
    preview: previewOf(created),
    isRequest: other.status === "REQUEST",
  });
  return { conversationId, messageId: created.id };
}

// ─── Reading ────────────────────────────────────────────────────────────

const PERSON = { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true } as const;

export async function listConversations(userId: string, box: "inbox" | "requests") {
  const blocks = await db.userBlock.findMany({ where: { blockerId: userId }, select: { blockedId: true } });
  const blockedIds = blocks.map((b) => b.blockedId);
  const mine = await db.conversationParticipant.findMany({
    where: {
      userId,
      status: box === "inbox" ? "ACTIVE" : "REQUEST",
      conversation: { participants: { none: { userId: { in: blockedIds } } } },
    },
    include: {
      conversation: {
        include: {
          participants: { include: { user: { select: PERSON } } },
          messages: { where: notExpired(), orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { conversation: { lastMessageAt: "desc" } },
    take: 100,
  });

  const now = new Date();
  const rows = await Promise.all(
    mine
      // Deleted from the list, and nothing new since.
      .filter((p) => !p.hiddenAt || p.conversation.lastMessageAt > p.hiddenAt)
      // A request only shows once there's an actual message in it.
      .filter((p) => p.conversation.messages.length > 0 || box === "inbox")
      .map(async (p) => {
        const other = p.conversation.participants.find((x) => x.userId !== userId);
        const last = p.conversation.messages[0] ?? null;
        const unread = await db.directMessage.count({
          where: {
            conversationId: p.conversationId,
            senderId: { not: userId },
            createdAt: { gt: p.lastReadAt ?? new Date(0) },
            ...notExpired(now),
          },
        });
        return {
          id: p.conversationId,
          other: other?.user ?? null,
          lastMessage: last
            ? {
                fromMe: last.senderId === userId,
                preview: last.deletedAt ? "Message deleted" : previewOf(last),
                createdAt: last.createdAt.toISOString(),
              }
            : null,
          unread,
          muted: !!p.mutedUntil && p.mutedUntil > now,
          lastMessageAt: p.conversation.lastMessageAt.toISOString(),
        };
      }),
  );
  return rows.filter((r) => r.other);
}

/** Badge numbers: conversations with unread messages, and pending requests. */
export async function unreadSummary(userId: string) {
  const [inbox, requests] = await Promise.all([listConversations(userId, "inbox"), listConversations(userId, "requests")]);
  return { unreadConversations: inbox.filter((c) => c.unread > 0).length, requests: requests.length };
}

type ShareCard = { type: string; id: string; title: string; subtitle: string; imageUrl: string | null; href: string; status?: string };

function ladder(json: unknown, size = "256"): string | null {
  return (json as Record<string, string> | null)?.[size] ?? null;
}

async function shareCards(messages: { shareType: string | null; shareId: string | null }[]): Promise<Map<string, ShareCard>> {
  const ids = (t: string) => [...new Set(messages.filter((m) => m.shareType === t && m.shareId).map((m) => m.shareId!))];
  const [products, events, lives] = await Promise.all([
    db.product.findMany({
      where: { id: { in: ids("PRODUCT") } },
      select: {
        id: true,
        type: true,
        title: true,
        status: true,
        creator: { select: { displayName: true } },
        release: { select: { artworkLadder: true } },
        beat: { select: { coverImageLadder: true } },
        merchItem: { select: { imageLadder: true } },
      },
    }),
    db.event.findMany({
      where: { id: { in: ids("EVENT") } },
      select: { id: true, title: true, status: true, coverImageLadder: true, creator: { select: { displayName: true } } },
    }),
    db.liveSession.findMany({
      where: { id: { in: ids("LIVE") } },
      select: { id: true, title: true, status: true, creator: { select: { displayName: true, avatarUrl: true } } },
    }),
  ]);
  const cards = new Map<string, ShareCard>();
  for (const p of products) {
    const path = p.type === "BEAT" ? "b" : p.type === "MERCH" ? "m" : "r";
    cards.set(`PRODUCT:${p.id}`, {
      type: p.type,
      id: p.id,
      title: p.title,
      subtitle: `${p.type === "BEAT" ? "Beat" : p.type === "MERCH" ? "Merch" : "Music"} · ${p.creator.displayName}`,
      imageUrl: ladder(p.release?.artworkLadder) ?? ladder(p.beat?.coverImageLadder) ?? ladder(p.merchItem?.imageLadder),
      href: `/${path}/${p.id}`,
      status: p.status === "PUBLISHED" ? undefined : "No longer available",
    });
  }
  for (const e of events) {
    cards.set(`EVENT:${e.id}`, {
      type: "EVENT",
      id: e.id,
      title: e.title,
      subtitle: `Event · ${e.creator.displayName}`,
      imageUrl: ladder(e.coverImageLadder),
      href: `/e/${e.id}`,
      status: e.status === "PUBLISHED" ? undefined : "No longer available",
    });
  }
  for (const l of lives) {
    cards.set(`LIVE:${l.id}`, {
      type: "LIVE",
      id: l.id,
      title: l.title,
      subtitle: `Live · ${l.creator.displayName}`,
      imageUrl: l.creator.avatarUrl,
      href: `/live/${l.id}`,
      status: l.status === "LIVE" ? "Live now" : l.status === "SCHEDULED" ? "Upcoming" : "Live ended",
    });
  }
  return cards;
}

/**
 * One conversation for the person viewing it: the other person, both
 * statuses, the disappearing-messages state (and any pending proposal), the
 * other person's read position, and messages — newest PAGE_SIZE, or only
 * those after `after` when refreshing. Opening it marks it read.
 */
export async function getThread(conversationId: string, userId: string, after?: Date) {
  const { me, other, conversation } = await loadParticipant(conversationId, userId);
  const now = new Date();
  const [otherUser, rows, blockedByMe, blockedMe] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: other.userId }, select: PERSON }),
    db.directMessage.findMany({
      where: { conversationId, ...notExpired(now), ...(after ? { createdAt: { gt: after } } : {}) },
      orderBy: { createdAt: after ? "asc" : "desc" },
      take: after ? 200 : PAGE_SIZE,
    }),
    db.userBlock.count({ where: { blockerId: userId, blockedId: other.userId } }),
    db.userBlock.count({ where: { blockerId: other.userId, blockedId: userId } }),
  ]);
  const messages = after ? rows : rows.reverse();
  const cards = await shareCards(messages);

  // Reading it: mark read (requests too — opening a request isn't accepting it).
  await db.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: now },
  });

  const myMessagesSent = await db.directMessage.count({ where: { conversationId, senderId: userId, kind: { not: "SYSTEM" } } });
  return {
    id: conversationId,
    other: otherUser,
    myStatus: me.status,
    otherStatus: other.status,
    mutedUntil: me.mutedUntil && me.mutedUntil > now ? me.mutedUntil.toISOString() : null,
    // You've used your one message and they haven't accepted yet.
    waitingForAccept: other.status === "REQUEST" && myMessagesSent > 0,
    blockedByMe: blockedByMe > 0,
    blockedMe: blockedMe > 0,
    otherLastReadAt: other.lastReadAt?.toISOString() ?? null,
    disappear: {
      seconds: conversation.disappearSeconds,
      label: disappearLabel(conversation.disappearSeconds),
      pending:
        conversation.pendingDisappearSeconds !== null && conversation.pendingDisappearById
          ? {
              seconds: conversation.pendingDisappearSeconds,
              label: disappearLabel(conversation.pendingDisappearSeconds || null),
              byMe: conversation.pendingDisappearById === userId,
            }
          : null,
    },
    messages: messages.map((m) => ({
      id: m.id,
      fromMe: m.senderId === userId,
      kind: m.kind,
      body: m.deletedAt ? null : m.body,
      imageUrl: m.deletedAt ? null : m.imageUrl,
      share: !m.deletedAt && m.shareType && m.shareId ? (cards.get(`${m.shareType}:${m.shareId}`) ?? null) : null,
      deleted: !!m.deletedAt,
      createdAt: m.createdAt.toISOString(),
      expiresAt: m.expiresAt?.toISOString() ?? null,
    })),
    serverTime: now.toISOString(),
  };
}

// ─── Actions ────────────────────────────────────────────────────────────

export async function deleteMessage(conversationId: string, userId: string, messageId: string) {
  const m = await db.directMessage.findUnique({ where: { id: messageId } });
  if (!m || m.conversationId !== conversationId) throw new MessageError("Message not found", 404);
  if (m.senderId !== userId || m.kind === "SYSTEM") throw new MessageError("You can only delete your own messages", 403);
  await db.directMessage.update({
    where: { id: messageId },
    data: { deletedAt: new Date(), body: null, imageUrl: null, shareType: null, shareId: null },
  });
}

export async function acceptRequest(conversationId: string, userId: string) {
  await loadParticipant(conversationId, userId);
  await db.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { status: "ACTIVE", hiddenAt: null },
  });
}

/** Delete a conversation (or a request) from your own list. A newer message brings it back. */
export async function hideConversation(conversationId: string, userId: string) {
  await loadParticipant(conversationId, userId);
  await db.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { hiddenAt: new Date() },
  });
}

async function systemMessage(tx: Prisma.TransactionClient, conversationId: string, senderId: string, body: string) {
  const now = new Date();
  await tx.directMessage.create({ data: { conversationId, senderId, kind: "SYSTEM", body } });
  await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } });
}

/** Propose a disappearing-messages setting (seconds, or 0 for off); the other person has to approve. */
export async function proposeDisappearing(conversationId: string, userId: string, seconds: number) {
  if (seconds !== 0 && !(seconds in DISAPPEAR_OPTIONS)) throw new MessageError("Pick 24 hours, 1 week, 1 month or 3 months", 400);
  const { other, conversation } = await loadParticipant(conversationId, userId);
  if (await blockedEitherWay(userId, other.userId)) throw new MessageError("You can't change this conversation", 403);
  if ((conversation.disappearSeconds ?? 0) === seconds) throw new MessageError("That's already the setting", 400);
  const me = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true } });
  await db.$transaction(async (tx) => {
    await tx.conversation.update({
      where: { id: conversationId },
      data: { pendingDisappearSeconds: seconds, pendingDisappearById: userId },
    });
    await systemMessage(
      tx,
      conversationId,
      userId,
      seconds === 0
        ? `${me.displayName} asked to turn off disappearing messages`
        : `${me.displayName} asked to turn on disappearing messages (${disappearLabel(seconds)})`,
    );
  });
  await sendPushToUsers([other.userId], {
    title: me.displayName,
    body: seconds === 0 ? "Asked to turn off disappearing messages" : `Asked to turn on disappearing messages (${disappearLabel(seconds)})`,
    url: `/messages/${conversationId}`,
    tag: `dm-${conversationId}`,
  }).catch(() => {});
}

/** The other person approves or declines a pending proposal; the proposer can withdraw it. */
export async function respondDisappearing(conversationId: string, userId: string, approve: boolean) {
  const { conversation } = await loadParticipant(conversationId, userId);
  const pending = conversation.pendingDisappearSeconds;
  if (pending === null || !conversation.pendingDisappearById) throw new MessageError("Nothing waiting for approval", 409);
  const isProposer = conversation.pendingDisappearById === userId;
  if (approve && isProposer) throw new MessageError("The other person has to approve this", 403);
  const me = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true } });

  await db.$transaction(async (tx) => {
    const { count } = await tx.conversation.updateMany({
      where: { id: conversationId, pendingDisappearSeconds: pending, pendingDisappearById: conversation.pendingDisappearById },
      data: {
        pendingDisappearSeconds: null,
        pendingDisappearById: null,
        ...(approve ? { disappearSeconds: pending === 0 ? null : pending } : {}),
      },
    });
    if (count === 0) throw new MessageError("That was already answered", 409);
    await systemMessage(
      tx,
      conversationId,
      userId,
      approve
        ? pending === 0
          ? `Disappearing messages turned off`
          : `Disappearing messages on — new messages disappear after ${disappearLabel(pending)}`
        : isProposer
          ? `${me.displayName} withdrew the disappearing messages request`
          : `${me.displayName} declined the disappearing messages request`,
    );
  });
}

export async function setBlocked(blockerId: string, blockedId: string, blocked: boolean) {
  if (blockerId === blockedId) throw new MessageError("You can't block yourself", 400);
  if (blocked) {
    await db.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      update: {},
      create: { blockerId, blockedId },
    });
  } else {
    await db.userBlock.deleteMany({ where: { blockerId, blockedId } });
  }
}

/** Find (without creating) the conversation with someone, for a profile's Message button. */
export async function conversationIdWith(userId: string, otherId: string) {
  const c = await db.conversation.findUnique({ where: { pairKey: pairKeyFor(userId, otherId) }, select: { id: true } });
  return c?.id ?? null;
}

/** Daily cron: hard-delete disappearing messages past their time. */
export async function purgeExpiredMessages() {
  const { count } = await db.directMessage.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return count;
}

// ─── Notifications ────────────────────────────────────────────────────────

export const MUTE_OPTIONS = { "8h": 8 * 3600_000, "1w": 7 * 86_400_000 } as const;
// "Always" is stored as a far-future date rather than a separate flag.
const MUTED_FOREVER = new Date("2100-01-01T00:00:00Z");

/** Mute a conversation for 8 hours, 1 week, always — or unmute ("off"). */
export async function setMuted(conversationId: string, userId: string, duration: "8h" | "1w" | "always" | "off") {
  await loadParticipant(conversationId, userId);
  const mutedUntil =
    duration === "off" ? null : duration === "always" ? MUTED_FOREVER : new Date(Date.now() + MUTE_OPTIONS[duration]);
  await db.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { mutedUntil },
  });
}

/**
 * Newest incoming messages since `since` (max 5), for the in-app banner
 * that slides in while someone is elsewhere in the app. Skips muted chats,
 * blocked people, system lines and anything that's already been read.
 */
export async function latestIncoming(userId: string, since: Date) {
  const now = new Date();
  const blocks = await db.userBlock.findMany({ where: { blockerId: userId }, select: { blockedId: true } });
  const messages = await db.directMessage.findMany({
    where: {
      createdAt: { gt: since },
      senderId: { not: userId, notIn: blocks.map((b) => b.blockedId) },
      kind: { not: "SYSTEM" },
      deletedAt: null,
      ...notExpired(now),
      conversation: {
        participants: {
          some: { userId, OR: [{ mutedUntil: null }, { mutedUntil: { lt: now } }] },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      sender: { select: { displayName: true, avatarUrl: true } },
      conversation: { select: { participants: { where: { userId }, select: { status: true, lastReadAt: true } } } },
    },
  });
  return messages
    .filter((m) => {
      const me = m.conversation.participants[0];
      return !me?.lastReadAt || m.createdAt > me.lastReadAt;
    })
    .map((m) => {
      const isRequest = m.conversation.participants[0]?.status === "REQUEST";
      return {
        messageId: m.id,
        conversationId: m.conversationId,
        sender: m.sender,
        isRequest,
        preview: isRequest ? "wants to send you a message" : previewOf(m),
        createdAt: m.createdAt.toISOString(),
      };
    });
}
