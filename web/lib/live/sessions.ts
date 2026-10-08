// LiveSession lifecycle: schedule, start, end, and the "who's live now" /
// "upcoming" reads that power Discover's Go Live rail / Socials' Live now
// rail. Money-moving actions (gifts/paid access/paid requests) are
// lib/live/spend.ts; the LiveKit room itself is lib/live/liveKit.ts.
//
// Eligibility: any signed-in user can start a Live for now (the write-up's
// "any eligible creator" is deliberately left open — no separate gate like
// assertCanPublish's upload-cap check, since going live doesn't consume a
// publish slot). Tighten this later if a real eligibility rule is needed.

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createLiveKitRoom, endLiveKitRoom, getParticipantCount, getRoomViewerCounts } from "@/lib/live/liveKit";
import { settleBattlesOnLiveEnd } from "@/lib/live/battle";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";

export class AlreadyLiveError extends Error {
  constructor(public session: { id: string; title: string; startedAt: Date }) {
    super("Already live");
  }
}
export class LiveSessionNotFoundError extends Error {}
export class NotSessionOwnerError extends Error {}
export class LiveSessionAlreadyEndedError extends Error {}
export class InvalidPinnedProductError extends Error {}
export class InvalidScheduleError extends Error {}
export class LiveNotScheduledError extends Error {}

// A scheduled Live must be at least this far out (anything sooner is just
// "go live now") and at most this far (keeps the Upcoming rail meaningful).
export const MIN_SCHEDULE_AHEAD_MS = 5 * 60 * 1000;
export const MAX_SCHEDULE_AHEAD_MS = 60 * 24 * 60 * 60 * 1000;
// Per creator, so the Upcoming rail can't be flooded by one account.
const MAX_UPCOMING_PER_CREATOR = 5;
// A scheduled Live the host never started drops off the Upcoming rail this
// long after its start time (it stays startable/cancellable from its link).
const UPCOMING_GRACE_MS = 6 * 60 * 60 * 1000;

/** One live session per creator at a time — same "only one at a time" shape as a Billboard. */
export async function getActiveLiveSessionForCreator(creatorId: string) {
  return db.liveSession.findFirst({ where: { creatorId, status: "LIVE" } });
}

type LiveDetails = {
  creatorId: string;
  title: string;
  description?: string;
  coverImageLadder?: Record<string, string>;
  isPaidAccess: boolean;
  priceXg: number;
  pinnedProductId?: string;
};

async function assertPinnableProduct(creatorId: string, pinnedProductId?: string) {
  if (!pinnedProductId) return;
  const product = await db.product.findUnique({ where: { id: pinnedProductId } });
  if (!product || product.creatorId !== creatorId || product.status !== "PUBLISHED") {
    throw new InvalidPinnedProductError();
  }
}

function detailsData(args: LiveDetails) {
  return {
    creatorId: args.creatorId,
    title: args.title,
    description: args.description,
    coverImageLadder: args.coverImageLadder,
    isPaidAccess: args.isPaidAccess,
    priceXg: args.isPaidAccess ? Math.max(0, Math.round(args.priceXg)) : 0,
    pinnedProductId: args.pinnedProductId,
  };
}

/**
 * "X is live now" — to everyone who tapped Remind me on it, plus the host's
 * followers (explicit ask: people should be able to join the Live). Saved to
 * each bell and pushed, after the response (lib/notifications/create.ts).
 */
async function notifyLiveStarted(session: { id: string; title: string; creatorId: string }) {
  const [creator, reminders, followers] = await Promise.all([
    db.user.findUnique({ where: { id: session.creatorId }, select: { displayName: true, avatarUrl: true } }),
    db.liveReminder.findMany({ where: { liveSessionId: session.id }, select: { userId: true } }),
    db.follow.findMany({ where: { followedId: session.creatorId }, select: { followerId: true } }),
  ]);
  const recipients = [...reminders.map((r) => r.userId), ...followers.map((f) => f.followerId)].filter((id) => id !== session.creatorId);
  if (!creator || recipients.length === 0) return;
  notifyUsersAfterResponse(recipients, {
    kind: "LIVE",
    title: `🔴 ${creator.displayName} is live now`,
    body: session.title,
    url: `/live/${session.id}`,
    icon: creator.avatarUrl ?? undefined,
    tag: `live-${session.id}`,
  });
}

/** Go live right now. */
export async function startLiveSession(args: LiveDetails) {
  const existing = await getActiveLiveSessionForCreator(args.creatorId);
  if (existing) throw new AlreadyLiveError(existing);
  await assertPinnableProduct(args.creatorId, args.pinnedProductId);

  // Room name is generated up front (not derived from the row's own id
  // after insert) so this is one insert, not a create-then-update — two
  // concurrent Go-Lives never race on a shared placeholder value against
  // LiveSession.roomName's unique constraint.
  const roomName = await createLiveKitRoom(randomUUID());
  const session = await db.liveSession.create({ data: { ...detailsData(args), roomName } });
  await notifyLiveStarted(session);
  return session;
}

/**
 * Creates a Live for later (explicit ask): a real LiveSession with its own
 * shareable /live/[id] link right away, but no LiveKit room — that's only
 * created when the host starts it (startScheduledLiveSession).
 */
export async function scheduleLiveSession(args: LiveDetails & { scheduledFor: Date }) {
  const ahead = args.scheduledFor.getTime() - Date.now();
  if (Number.isNaN(ahead) || ahead < MIN_SCHEDULE_AHEAD_MS || ahead > MAX_SCHEDULE_AHEAD_MS) throw new InvalidScheduleError();
  await assertPinnableProduct(args.creatorId, args.pinnedProductId);

  const upcoming = await db.liveSession.count({ where: { creatorId: args.creatorId, status: "SCHEDULED" } });
  if (upcoming >= MAX_UPCOMING_PER_CREATOR) throw new InvalidScheduleError();

  return db.liveSession.create({
    data: { ...detailsData(args), status: "SCHEDULED", scheduledFor: args.scheduledFor },
  });
}

/** The host starts their scheduled Live: creates the room, flips it LIVE, alerts reminders + followers. */
export async function startScheduledLiveSession(args: { liveSessionId: string; creatorId: string }) {
  const session = await db.liveSession.findUnique({ where: { id: args.liveSessionId } });
  if (!session) throw new LiveSessionNotFoundError();
  if (session.creatorId !== args.creatorId) throw new NotSessionOwnerError();
  if (session.status !== "SCHEDULED") throw new LiveNotScheduledError();

  const existing = await getActiveLiveSessionForCreator(args.creatorId);
  if (existing) throw new AlreadyLiveError(existing);

  const roomName = await createLiveKitRoom(randomUUID());
  // Conditional on still being SCHEDULED, so a double-tap can't start it twice.
  const { count } = await db.liveSession.updateMany({
    where: { id: session.id, status: "SCHEDULED" },
    data: { status: "LIVE", roomName, startedAt: new Date() },
  });
  if (count === 0) {
    await endLiveKitRoom(roomName).catch(() => {});
    throw new LiveNotScheduledError();
  }
  await notifyLiveStarted(session);
  return db.liveSession.findUniqueOrThrow({ where: { id: session.id } });
}

/**
 * Bumps LiveSession.peakViewers to the current LiveKit room size if it's a
 * new high — called (via after()) from GET /api/live/[id]/join on every
 * successful join, and once more by endLiveSession just before teardown
 * (host's own join counts too, same "whoever's in the room" definition the
 * client's own viewerCount display uses: remoteParticipants.size + 1).
 * Authoritative from LiveKit's own participant list, never a client-
 * reported number. Best-effort: a failure here shouldn't fail the join
 * itself, so callers should swallow rejections.
 */
export async function recordViewerJoin(liveSessionId: string, roomName: string): Promise<void> {
  const count = await getParticipantCount(roomName);
  await db.liveSession.updateMany({
    where: { id: liveSessionId, peakViewers: { lt: count } },
    data: { peakViewers: count },
  });
}

/** Ends a running Live — or cancels a scheduled one that never started. */
export async function endLiveSession(args: { liveSessionId: string; creatorId: string }) {
  const session = await db.liveSession.findUnique({ where: { id: args.liveSessionId } });
  if (!session) throw new LiveSessionNotFoundError();
  if (session.creatorId !== args.creatorId) throw new NotSessionOwnerError();
  if (session.status === "ENDED") throw new LiveSessionAlreadyEndedError();

  if (session.status === "LIVE" && session.roomName) {
    // Last reading before the room is torn down — a safety net in case a
    // per-join update was missed, so the end-of-Live summary never shows a
    // peak lower than who was actually still watching. Best-effort: ending
    // the Live must never fail because LiveKit was slow to answer.
    await recordViewerJoin(session.id, session.roomName).catch((err) => console.error("final peakViewers read failed", err));
    // A battle still running is settled first: voting finishes with the
    // votes so far, anything earlier is cancelled and the prize refunded.
    await settleBattlesOnLiveEnd(session.id).catch((err) => console.error("battle settle on Live end failed", err));
    await endLiveKitRoom(session.roomName);
  }
  return db.liveSession.update({ where: { id: args.liveSessionId }, data: { status: "ENDED", endedAt: new Date() } });
}

/** End-of-live earnings summary (write-up §5) — read fresh from the durable rows, never a running counter. */
export async function getLiveSessionSummary(liveSessionId: string) {
  const [session, gifts, accessGrants, requests] = await Promise.all([
    db.liveSession.findUnique({ where: { id: liveSessionId }, select: { peakViewers: true } }),
    db.liveGift.aggregate({ where: { liveSessionId, battleId: null }, _sum: { xgAmount: true }, _count: true }),
    db.liveAccessGrant.aggregate({ where: { liveSessionId }, _sum: { xgPaid: true }, _count: true }),
    db.liveRequest.aggregate({ where: { liveSessionId, status: { not: "DECLINED" } }, _sum: { xgAmount: true }, _count: true }),
  ]);
  return {
    peakViewers: session?.peakViewers ?? 0,
    giftsXg: gifts._sum.xgAmount ?? 0,
    giftsCount: gifts._count,
    paidAccessXg: accessGrants._sum.xgPaid ?? 0,
    paidAccessCount: accessGrants._count,
    paidRequestsXg: requests._sum.xgAmount ?? 0,
    paidRequestsCount: requests._count,
  };
}

export async function listLiveSessionsNow() {
  const [sessions, viewerCounts] = await Promise.all([
    db.liveSession.findMany({
      where: { status: "LIVE" },
      include: { creator: { select: { handle: true, displayName: true, avatarUrl: true } } },
      orderBy: { startedAt: "desc" },
    }),
    // Best-effort: the rail still renders (with 0s) if LiveKit is unreachable.
    getRoomViewerCounts().catch(() => new Map<string, number>()),
  ]);
  return sessions.map((s) => ({ ...s, viewerCount: (s.roomName && viewerCounts.get(s.roomName)) || 0 }));
}

/** The Upcoming rail: scheduled Lives, soonest first. */
export async function listUpcomingLiveSessions() {
  const sessions = await db.liveSession.findMany({
    where: { status: "SCHEDULED", scheduledFor: { gt: new Date(Date.now() - UPCOMING_GRACE_MS) } },
    include: {
      creator: { select: { handle: true, displayName: true, avatarUrl: true } },
      _count: { select: { reminders: true } },
    },
    orderBy: { scheduledFor: "asc" },
    take: 20,
  });
  return sessions.map(({ _count, ...s }) => ({ ...s, reminderCount: _count.reminders }));
}

/** Everything a /live/[id] link needs before joining: state, host, schedule, and the viewer's own reminder. */
export async function getLivePublicInfo(liveSessionId: string, viewerId: string | null) {
  const session = await db.liveSession.findUnique({
    where: { id: liveSessionId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      scheduledFor: true,
      startedAt: true,
      isPaidAccess: true,
      priceXg: true,
      coverImageLadder: true,
      creatorId: true,
      creator: { select: { handle: true, displayName: true, avatarUrl: true } },
      _count: { select: { reminders: true } },
    },
  });
  if (!session) return null;
  const reminded = viewerId
    ? Boolean(await db.liveReminder.findUnique({ where: { liveSessionId_userId: { liveSessionId, userId: viewerId } } }))
    : false;
  const { _count, creatorId, ...rest } = session;
  return { ...rest, reminderCount: _count.reminders, remindedByMe: reminded, isHost: viewerId === creatorId };
}

/** Remind me / un-remind for a scheduled Live. */
export async function setLiveReminder(args: { liveSessionId: string; userId: string; on: boolean }) {
  const session = await db.liveSession.findUnique({ where: { id: args.liveSessionId }, select: { status: true } });
  if (!session) throw new LiveSessionNotFoundError();
  if (session.status !== "SCHEDULED") throw new LiveNotScheduledError();
  if (args.on) {
    await db.liveReminder.upsert({
      where: { liveSessionId_userId: { liveSessionId: args.liveSessionId, userId: args.userId } },
      create: { liveSessionId: args.liveSessionId, userId: args.userId },
      update: {},
    });
  } else {
    await db.liveReminder.deleteMany({ where: { liveSessionId: args.liveSessionId, userId: args.userId } });
  }
  return db.liveReminder.count({ where: { liveSessionId: args.liveSessionId } });
}
