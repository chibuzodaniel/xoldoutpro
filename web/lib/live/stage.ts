// Live co-hosting (explicit ask, 2026-10-04): "the host should be able to
// add another person to the live from the list of people who joined, the
// host can appoint live moderators, and those who joined can request to join
// the live and get approved by either the host or a live moderator — with a
// list of the people who requested."
//
// Roles, per Live:
//   host       the session's creator. Everything below, plus appointing and
//              removing moderators.
//   moderator  appointed by the host (LiveModerator row). Approves/declines
//              requests, adds viewers to the stage, takes guests off it.
//   viewer     everyone else. Can ask to come on stage, cancel that, and
//              leave the stage once on it.
//
// "On stage" is the participant's LiveKit canPublish permission, flipped
// server-side (lib/live/liveKit.ts's setParticipantOnStage) — never stored in
// Postgres and never something a client can grant itself. Every change is
// announced on the room's "live-event" data topic (kind "stage" / "roles") so
// every open client refreshes its lists and the affected viewer reacts
// (turns their camera on, shows "you've been added", etc.). The first time
// someone comes up in a Live, their followers are told "X is live with Host"
// (alertGuestFollowers).

import { db } from "@/lib/db";
import { listRoomParticipants, publishLiveEvent, setParticipantOnStage, type RoomParticipant } from "@/lib/live/liveKit";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";

// Guests on stage at once, not counting the host — beyond this the screen
// stops being watchable on a phone.
export const MAX_STAGE_GUESTS = 3;

export class LiveNotLiveError extends Error {}
export class NotLiveStaffError extends Error {}
export class NotLiveHostError extends Error {}
export class NotInRoomError extends Error {}
export class StageFullError extends Error {}
export class StageRequestNotPendingError extends Error {}
export class InvalidStageTargetError extends Error {}

export type LiveRole = "host" | "moderator" | "viewer";

async function loadLive(liveSessionId: string) {
  const session = await db.liveSession.findUnique({ where: { id: liveSessionId }, select: { id: true, creatorId: true, status: true, roomName: true } });
  if (!session || session.status !== "LIVE" || !session.roomName) throw new LiveNotLiveError();
  return { ...session, roomName: session.roomName };
}

export async function getLiveRole(session: { id: string; creatorId: string }, userId: string): Promise<LiveRole> {
  if (session.creatorId === userId) return "host";
  const mod = await db.liveModerator.findUnique({ where: { liveSessionId_userId: { liveSessionId: session.id, userId } } });
  return mod ? "moderator" : "viewer";
}

async function requireStaff(liveSessionId: string, userId: string) {
  const session = await loadLive(liveSessionId);
  const role = await getLiveRole(session, userId);
  if (role === "viewer") throw new NotLiveStaffError();
  return { session, role };
}

function announce(roomName: string, event: Record<string, unknown>) {
  return publishLiveEvent(roomName, event).catch((err) => console.error("live stage announce failed", err));
}

/** Brings a viewer up; returns who's in the room (null if they were already on stage). */
async function putOnStage(session: { roomName: string; creatorId: string }, targetUserId: string): Promise<Set<string> | null> {
  const participants = await listRoomParticipants(session.roomName);
  const target = participants.find((p) => p.identity === targetUserId);
  if (!target) throw new NotInRoomError();
  if (target.canPublish) return null; // already on stage — nothing to do
  const guests = participants.filter((p) => p.canPublish && p.identity !== session.creatorId);
  if (guests.length >= MAX_STAGE_GUESTS) throw new StageFullError();
  await setParticipantOnStage(session.roomName, targetUserId, true);
  return new Set(participants.map((p) => p.identity));
}

/**
 * "X is live with Host" to the guest's followers (explicit ask, 2026-10-08:
 * anyone who comes on stage — battle competitors included — calls their
 * followers in). Once per guest per Live: the LiveGuestAlert insert is the
 * claim, so concurrent or repeat calls can't ping the same followers twice.
 * `battleTitle` swaps in the battle wording; `inRoom` skips followers who
 * are already watching.
 */
export async function alertGuestFollowers(args: {
  liveSessionId: string;
  hostId: string;
  guestId: string;
  battleTitle?: string;
  inRoom?: Set<string>;
}) {
  if (args.guestId === args.hostId) return;
  const { count } = await db.liveGuestAlert.createMany({
    data: [{ liveSessionId: args.liveSessionId, userId: args.guestId }],
    skipDuplicates: true,
  });
  if (count === 0) return;
  const [people, followers] = await Promise.all([
    peopleById([args.guestId, args.hostId]),
    db.follow.findMany({ where: { followedId: args.guestId }, select: { followerId: true } }),
  ]);
  const guest = people.get(args.guestId);
  const host = people.get(args.hostId);
  const ids = followers.map((f) => f.followerId).filter((id) => id !== args.hostId && !args.inRoom?.has(id));
  if (!guest || !host || ids.length === 0) return;
  notifyUsersAfterResponse(ids, {
    kind: "LIVE",
    title: args.battleTitle ? `⚔️ ${guest.displayName} is live with ${host.displayName} in a battle` : `🔴 ${guest.displayName} is live with ${host.displayName}`,
    body: args.battleTitle ? `Join and support them in “${args.battleTitle}”` : "They're on stage now — join the Live",
    url: `/live/${args.liveSessionId}`,
    icon: guest.avatarUrl ?? undefined,
    tag: `live-${args.liveSessionId}-${args.guestId}`,
  });
}

type PersonInfo = { userId: string; displayName: string; handle: string; avatarUrl: string | null };

async function peopleById(ids: string[]): Promise<Map<string, PersonInfo>> {
  const users = await db.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, displayName: true, handle: true, avatarUrl: true },
  });
  return new Map(users.map((u) => [u.id, { userId: u.id, displayName: u.displayName, handle: u.handle, avatarUrl: u.avatarUrl }]));
}

/**
 * Everything a client needs to draw the stage and the People sheet. Anyone
 * in the Live gets who's on stage (to label video tiles), the moderator list
 * and their own request status; the host and moderators also get everyone
 * watching and the pending requests.
 */
export async function getStageState(liveSessionId: string, userId: string) {
  const session = await loadLive(liveSessionId);
  const [role, participants, moderators, myRequest] = await Promise.all([
    getLiveRole(session, userId),
    listRoomParticipants(session.roomName),
    db.liveModerator.findMany({ where: { liveSessionId }, select: { userId: true } }),
    db.liveStageRequest.findUnique({ where: { liveSessionId_userId: { liveSessionId, userId } }, select: { status: true } }),
  ]);
  const moderatorIds = new Set(moderators.map((m) => m.userId));
  const isStaff = role !== "viewer";

  const requests = isStaff
    ? await db.liveStageRequest.findMany({ where: { liveSessionId, status: "PENDING" }, orderBy: { createdAt: "asc" } })
    : [];
  const inRoom = new Set(participants.map((p) => p.identity));
  const people = await peopleById([...participants.map((p) => p.identity), ...requests.map((r) => r.userId)]);

  const roleOf = (id: string): LiveRole => (id === session.creatorId ? "host" : moderatorIds.has(id) ? "moderator" : "viewer");
  const describe = (p: RoomParticipant) => ({
    ...(people.get(p.identity) ?? { userId: p.identity, displayName: p.name || "Viewer", handle: "", avatarUrl: null }),
    role: roleOf(p.identity),
    onStage: p.canPublish && p.identity !== session.creatorId,
    joinedAt: p.joinedAt,
  });

  const described = participants.sort((a, b) => a.joinedAt - b.joinedAt).map(describe);
  return {
    role,
    hostId: session.creatorId,
    maxGuests: MAX_STAGE_GUESTS,
    onStage: described.filter((p) => p.onStage),
    moderatorIds: [...moderatorIds],
    myRequestStatus: myRequest?.status ?? null,
    // Staff only:
    watching: isStaff ? described.filter((p) => p.userId !== session.creatorId) : [],
    requests: isStaff
      ? requests.map((r) => ({
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          stillHere: inRoom.has(r.userId),
          ...(people.get(r.userId) ?? { userId: r.userId, displayName: "Viewer", handle: "", avatarUrl: null }),
        }))
      : [],
  };
}

/** A viewer asks to come on stage. Re-asking after a decline/cancel reopens the same row. */
export async function requestStage(liveSessionId: string, userId: string) {
  const session = await loadLive(liveSessionId);
  if (session.creatorId === userId) throw new InvalidStageTargetError();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true } });
  const request = await db.liveStageRequest.upsert({
    where: { liveSessionId_userId: { liveSessionId, userId } },
    update: { status: "PENDING", respondedById: null },
    create: { liveSessionId, userId },
  });
  await announce(session.roomName, { kind: "stage", type: "requested", userId, displayName: user.displayName, requestId: request.id });
  return request.status;
}

export async function cancelStageRequest(liveSessionId: string, userId: string) {
  const session = await loadLive(liveSessionId);
  const { count } = await db.liveStageRequest.updateMany({
    where: { liveSessionId, userId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (count > 0) await announce(session.roomName, { kind: "stage", type: "cancelled", userId });
}

/** A guest steps off stage themselves. */
export async function leaveStage(liveSessionId: string, userId: string) {
  const session = await loadLive(liveSessionId);
  if (session.creatorId === userId) throw new InvalidStageTargetError();
  await setParticipantOnStage(session.roomName, userId, false);
  await announce(session.roomName, { kind: "stage", type: "left", userId });
}

/** Host or moderator answers a request to join. */
export async function respondToStageRequest(args: { liveSessionId: string; actorId: string; targetUserId: string; approve: boolean }) {
  const { session } = await requireStaff(args.liveSessionId, args.actorId);
  const where = { liveSessionId: args.liveSessionId, userId: args.targetUserId, status: "PENDING" as const };
  const pending = await db.liveStageRequest.findFirst({ where });
  if (!pending) throw new StageRequestNotPendingError();

  // Bring them up first, so a full stage or a viewer who already left keeps
  // the request pending instead of marking it approved for nothing.
  const inRoom = args.approve ? await putOnStage(session, args.targetUserId) : null;

  const { count } = await db.liveStageRequest.updateMany({
    where,
    data: { status: args.approve ? "APPROVED" : "DECLINED", respondedById: args.actorId },
  });
  if (count === 0) throw new StageRequestNotPendingError();
  await announce(session.roomName, { kind: "stage", type: args.approve ? "approved" : "declined", userId: args.targetUserId });
  if (inRoom) await alertGuestFollowers({ liveSessionId: session.id, hostId: session.creatorId, guestId: args.targetUserId, inRoom });
}

/**
 * Host or moderator brings someone watching straight onto the stage.
 * `battleTitle`: they're coming up as a battle competitor (lib/live/battle.ts),
 * so their followers get the battle wording.
 */
export async function inviteToStage(args: { liveSessionId: string; actorId: string; targetUserId: string; battleTitle?: string }) {
  const { session } = await requireStaff(args.liveSessionId, args.actorId);
  if (args.targetUserId === session.creatorId) throw new InvalidStageTargetError();
  const inRoom = await putOnStage(session, args.targetUserId);
  await db.liveStageRequest.updateMany({
    where: { liveSessionId: args.liveSessionId, userId: args.targetUserId, status: "PENDING" },
    data: { status: "APPROVED", respondedById: args.actorId },
  });
  const actor = await db.user.findUniqueOrThrow({ where: { id: args.actorId }, select: { displayName: true } });
  await announce(session.roomName, { kind: "stage", type: "invited", userId: args.targetUserId, byName: actor.displayName });
  if (inRoom) {
    await alertGuestFollowers({ liveSessionId: session.id, hostId: session.creatorId, guestId: args.targetUserId, battleTitle: args.battleTitle, inRoom });
  }
}

/** Host or moderator takes a guest off stage. */
export async function removeFromStage(args: { liveSessionId: string; actorId: string; targetUserId: string }) {
  const { session } = await requireStaff(args.liveSessionId, args.actorId);
  if (args.targetUserId === session.creatorId) throw new InvalidStageTargetError();
  await setParticipantOnStage(session.roomName, args.targetUserId, false);
  await announce(session.roomName, { kind: "stage", type: "removed", userId: args.targetUserId });
}

/** Host only: appoint or remove a moderator for this Live. */
export async function setLiveModerator(args: { liveSessionId: string; actorId: string; targetUserId: string; on: boolean }) {
  const session = await loadLive(args.liveSessionId);
  if (session.creatorId !== args.actorId) throw new NotLiveHostError();
  if (args.targetUserId === session.creatorId) throw new InvalidStageTargetError();
  const key = { liveSessionId_userId: { liveSessionId: args.liveSessionId, userId: args.targetUserId } };
  if (args.on) {
    await db.liveModerator.upsert({ where: key, update: {}, create: { liveSessionId: args.liveSessionId, userId: args.targetUserId } });
  } else {
    await db.liveModerator.deleteMany({ where: { liveSessionId: args.liveSessionId, userId: args.targetUserId } });
  }
  await announce(session.roomName, { kind: "roles", type: args.on ? "moderator-added" : "moderator-removed", userId: args.targetUserId });
}

/** Shared error -> HTTP mapping for the stage routes. */
export function stageErrorResponse(err: unknown): { status: number; error: string } | null {
  if (err instanceof LiveNotLiveError) return { status: 404, error: "This Live has ended" };
  if (err instanceof NotLiveStaffError) return { status: 403, error: "Only the host or a moderator can do that" };
  if (err instanceof NotLiveHostError) return { status: 403, error: "Only the host can do that" };
  if (err instanceof NotInRoomError) return { status: 409, error: "They've left the Live" };
  if (err instanceof StageFullError) return { status: 409, error: `The stage is full — up to ${MAX_STAGE_GUESTS} guests at once` };
  if (err instanceof StageRequestNotPendingError) return { status: 409, error: "That request was already handled" };
  if (err instanceof InvalidStageTargetError) return { status: 400, error: "That isn't possible for the host" };
  return null;
}
