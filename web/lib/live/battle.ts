// Live battles (explicit ask, 2026-10-08): "competitions and things like rap
// battles in the Live section — a host, a timer for each competitor's turn
// that's recorded, supporters who gift each competitor, and a reward the
// host sets for the winner(s)." Decisions taken with the user:
//   - results are recorded (turns, gifts, votes, places), never video;
//   - score = 50% share of the battle's gift XG + 50% share of the vote;
//   - the prize is XG from the host's own balance, held when the battle
//     starts; the host picks 1–3 winning places and each place's amount;
//   - gifts to a competitor are paid to that competitor like any gift.
//
// Everything runs inside the host's Live. State changes are announced on the
// room's "live-event" data topic (kind "battle") so clients re-read the
// battle — no polling. Timers run on each device from the stored end time;
// the host's screen ends a turn / closes voting when time is up, and any
// read after that does it too (settleExpired), so nothing depends on one
// device staying connected.

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { debitCoins } from "@/lib/live/coins";
import { creditCreatorXg } from "@/lib/live/xgEarnings";
import { publishLiveEvent } from "@/lib/live/liveKit";
import { MAX_STAGE_GUESTS, alertGuestFollowers, inviteToStage } from "@/lib/live/stage";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";

export const BATTLE_LIMITS = {
  minCompetitors: 2,
  maxCompetitors: MAX_STAGE_GUESTS, // everyone performs on the shared stage
  maxRounds: 5,
  minTurnSeconds: 30,
  maxTurnSeconds: 300,
  minVotingSeconds: 60,
  maxVotingSeconds: 180,
  maxWinners: 3,
} as const;

export class BattleError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const ACTIVE = ["READY", "IN_PROGRESS", "VOTING"] as const;

async function loadLive(liveSessionId: string) {
  const session = await db.liveSession.findUnique({ where: { id: liveSessionId }, select: { id: true, creatorId: true, status: true, roomName: true } });
  if (!session) throw new BattleError("Live not found", 404);
  return session;
}

async function requireHost(liveSessionId: string, userId: string) {
  const session = await loadLive(liveSessionId);
  if (session.creatorId !== userId) throw new BattleError("Only the host can run a battle", 403);
  if (session.status !== "LIVE" || !session.roomName) throw new BattleError("This Live isn't running", 409);
  return { ...session, roomName: session.roomName };
}

async function activeBattle(liveSessionId: string, client: Prisma.TransactionClient | typeof db = db) {
  return client.liveBattle.findFirst({
    where: { liveSessionId, status: { in: [...ACTIVE] } },
    include: { competitors: { orderBy: { position: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}

function announce(roomName: string | null, type: string, battleId: string) {
  if (!roomName) return Promise.resolve();
  return publishLiveEvent(roomName, { kind: "battle", type, battleId }).catch((err) => console.error("battle announce failed", err));
}

// ─── Setup ──────────────────────────────────────────────────────────────

export type BattleSetup = {
  title: string;
  competitorIds: string[];
  // Mutual followers to ring — they join as competitors when they accept.
  inviteIds?: string[];
  rounds: number;
  turnSeconds: number;
  votingSeconds: number;
  // XG per winning place, best first: [500] or [300, 150, 50]. Empty = no prize.
  prizePlaces: number[];
};

export async function createBattle(liveSessionId: string, hostId: string, setup: BattleSetup) {
  const session = await requireHost(liveSessionId, hostId);
  if (await activeBattle(liveSessionId)) throw new BattleError("A battle is already running in this Live", 409);

  const ids = [...new Set(setup.competitorIds)];
  const inviteIds = [...new Set(setup.inviteIds ?? [])].filter((id) => !ids.includes(id));
  const L = BATTLE_LIMITS;
  const total = ids.length + inviteIds.length;
  if (total < L.minCompetitors || total > L.maxCompetitors) {
    throw new BattleError(`Pick or invite ${L.minCompetitors}–${L.maxCompetitors} competitors`, 400);
  }
  if (ids.includes(hostId) || inviteIds.includes(hostId)) throw new BattleError("The host runs the battle — pick other people to compete", 400);
  if (inviteIds.length > 0) {
    const mutual = await mutualFollowerIds(hostId, inviteIds);
    if (mutual.size !== inviteIds.length) throw new BattleError("You can only invite people you follow who follow you back", 400);
  }
  if (setup.rounds < 1 || setup.rounds > L.maxRounds) throw new BattleError(`Rounds must be 1–${L.maxRounds}`, 400);
  if (setup.turnSeconds < L.minTurnSeconds || setup.turnSeconds > L.maxTurnSeconds) {
    throw new BattleError("Each turn must be between 30 seconds and 5 minutes", 400);
  }
  if (setup.votingSeconds < L.minVotingSeconds || setup.votingSeconds > L.maxVotingSeconds) {
    throw new BattleError("Voting must last 1–3 minutes", 400);
  }
  const places = setup.prizePlaces.filter((x) => x > 0);
  if (places.length > Math.min(L.maxWinners, total)) throw new BattleError("Too many winning places for the number of competitors", 400);
  if (places.some((x) => !Number.isInteger(x))) throw new BattleError("Prizes must be whole XG", 400);

  const users = await db.user.count({ where: { id: { in: ids }, deletedAt: null } });
  if (users !== ids.length) throw new BattleError("One of those competitors isn't available", 400);

  const battle = await db.liveBattle.create({
    data: {
      liveSessionId,
      hostId,
      title: setup.title.trim().slice(0, 80) || "Battle",
      rounds: setup.rounds,
      turnSeconds: setup.turnSeconds,
      votingSeconds: setup.votingSeconds,
      prizePlaces: places,
      prizeXg: places.reduce((a, b) => a + b, 0),
      competitors: { create: ids.map((userId, position) => ({ userId, position })) },
      invites: { create: inviteIds.map((userId) => ({ userId })) },
    },
    include: { invites: { select: { id: true, userId: true } } },
  });
  if (battle.invites.length > 0) await ringInvitees(battle.id);
  // Picked straight from the viewers (explicit ask, 2026-10-08): bring
  // everyone competing on stage now so they can get ready before Start.
  // Best-effort — someone already up, or a full stage, is fine.
  for (const userId of ids) {
    await inviteToStage({ liveSessionId, actorId: hostId, targetUserId: userId, battleTitle: battle.title }).catch(() => {});
  }
  await announce(session.roomName, "created", battle.id);
  return battle;
}

/** Holds the prize from the host's XG, brings the competitors on stage, and opens the first round. */
export async function startBattle(liveSessionId: string, hostId: string) {
  const session = await requireHost(liveSessionId, hostId);
  const battle = await activeBattle(liveSessionId);
  if (!battle || battle.status !== "READY") throw new BattleError("No battle waiting to start", 409);
  if (battle.competitors.length < BATTLE_LIMITS.minCompetitors) {
    throw new BattleError("Wait for at least 2 competitors — invites still ringing count once they accept", 409);
  }
  // Anyone who hasn't answered by now misses this one.
  await db.liveBattleInvite.updateMany({ where: { battleId: battle.id, status: "PENDING" }, data: { status: "EXPIRED", respondedAt: new Date() } });

  await db.$transaction(async (tx) => {
    if (battle.prizeXg > 0) await debitCoins(tx, hostId, battle.prizeXg, "BATTLE_PRIZE_HOLD");
    const { count } = await tx.liveBattle.updateMany({
      where: { id: battle.id, status: "READY" },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
    if (count === 0) throw new BattleError("That battle already started", 409);
  });

  // Everyone competing goes on the shared stage (best-effort — someone who
  // stepped out of the Live can be brought back up later).
  for (const c of battle.competitors) {
    await inviteToStage({ liveSessionId, actorId: hostId, targetUserId: c.userId, battleTitle: battle.title }).catch(() => {});
  }
  await announce(session.roomName, "started", battle.id);
}

// ─── Turns ──────────────────────────────────────────────────────────────

/** Closes a turn whose time is up, and a vote whose time is up (idempotent). */
async function settleExpired(battleId: string) {
  const now = new Date();
  const battle = await db.liveBattle.findUnique({ where: { id: battleId } });
  if (!battle) return;
  if (battle.status === "IN_PROGRESS" && battle.currentTurnId) {
    const turn = await db.liveBattleTurn.findUnique({ where: { id: battle.currentTurnId } });
    if (turn && !turn.endedAt && turn.endsAt <= now) {
      await db.liveBattleTurn.updateMany({ where: { id: turn.id, endedAt: null }, data: { endedAt: turn.endsAt } });
      await db.liveBattle.updateMany({ where: { id: battleId, currentTurnId: turn.id }, data: { currentTurnId: null } });
    }
  }
  if (battle.status === "VOTING" && battle.votingEndsAt && battle.votingEndsAt <= now) {
    await finishBattle(battleId);
  }
}

/** Who's up next: turns go round-robin in competitor order, round by round. */
async function nextUp(battle: { id: string; rounds: number; competitors: { id: string; position: number }[] }) {
  const done = await db.liveBattleTurn.count({ where: { battleId: battle.id } });
  const n = battle.competitors.length;
  const round = Math.floor(done / n) + 1;
  if (round > battle.rounds) return null;
  return { round, competitor: battle.competitors[done % n] };
}

export async function startTurn(liveSessionId: string, hostId: string) {
  const session = await requireHost(liveSessionId, hostId);
  const battle = await activeBattle(liveSessionId);
  if (!battle || battle.status !== "IN_PROGRESS") throw new BattleError("The battle isn't running", 409);
  await settleExpired(battle.id);
  const fresh = await db.liveBattle.findUniqueOrThrow({ where: { id: battle.id } });
  if (fresh.currentTurnId) throw new BattleError("End the current turn first", 409);
  const next = await nextUp(battle);
  if (!next) throw new BattleError("Every round is done — open voting", 409);

  const now = new Date();
  await db.$transaction(async (tx) => {
    const turn = await tx.liveBattleTurn.create({
      data: {
        battleId: battle.id,
        competitorId: next.competitor.id,
        round: next.round,
        startedAt: now,
        endsAt: new Date(now.getTime() + battle.turnSeconds * 1000),
      },
    });
    const { count } = await tx.liveBattle.updateMany({
      where: { id: battle.id, currentTurnId: null },
      data: { currentTurnId: turn.id },
    });
    if (count === 0) throw new BattleError("A turn is already running", 409);
  });
  await announce(session.roomName, "turn-started", battle.id);
}

/** The host ends the current turn early (or the host's screen does when its timer runs out). */
export async function endTurn(liveSessionId: string, hostId: string) {
  const session = await requireHost(liveSessionId, hostId);
  const battle = await activeBattle(liveSessionId);
  if (!battle?.currentTurnId) return;
  const now = new Date();
  const turn = await db.liveBattleTurn.findUnique({ where: { id: battle.currentTurnId } });
  await db.liveBattleTurn.updateMany({
    where: { id: battle.currentTurnId, endedAt: null },
    data: { endedAt: turn && turn.endsAt < now ? turn.endsAt : now },
  });
  await db.liveBattle.updateMany({ where: { id: battle.id, currentTurnId: battle.currentTurnId }, data: { currentTurnId: null } });
  await announce(session.roomName, "turn-ended", battle.id);
}

// ─── Voting and results ─────────────────────────────────────────────────

export async function openVoting(liveSessionId: string, hostId: string) {
  const session = await requireHost(liveSessionId, hostId);
  const battle = await activeBattle(liveSessionId);
  if (!battle || battle.status !== "IN_PROGRESS") throw new BattleError("The battle isn't running", 409);
  if (battle.currentTurnId) await endTurn(liveSessionId, hostId);
  await db.liveBattle.updateMany({
    where: { id: battle.id, status: "IN_PROGRESS" },
    data: { status: "VOTING", votingEndsAt: new Date(Date.now() + battle.votingSeconds * 1000) },
  });
  await announce(session.roomName, "voting", battle.id);
}

/** One vote per viewer (can be changed while voting is open). Competitors and the host can't vote. */
export async function castVote(liveSessionId: string, voterId: string, competitorId: string) {
  const battle = await activeBattle(liveSessionId);
  if (!battle || battle.status !== "VOTING" || !battle.votingEndsAt || battle.votingEndsAt <= new Date()) {
    throw new BattleError("Voting isn't open", 409);
  }
  if (battle.hostId === voterId || battle.competitors.some((c) => c.userId === voterId)) {
    throw new BattleError("Competitors and the host can't vote", 403);
  }
  if (!battle.competitors.some((c) => c.id === competitorId)) throw new BattleError("Pick one of the competitors", 400);
  await db.liveBattleVote.upsert({
    where: { battleId_voterId: { battleId: battle.id, voterId } },
    update: { competitorId },
    create: { battleId: battle.id, voterId, competitorId },
  });
}

async function tallies(battleId: string) {
  const [gifts, votes] = await Promise.all([
    db.liveGift.groupBy({ by: ["recipientId"], where: { battleId }, _sum: { xgAmount: true } }),
    db.liveBattleVote.groupBy({ by: ["competitorId"], where: { battleId }, _count: true }),
  ]);
  return {
    giftsByUser: new Map(gifts.map((g) => [g.recipientId ?? "", g._sum.xgAmount ?? 0])),
    votesByCompetitor: new Map(votes.map((v) => [v.competitorId, v._count])),
  };
}

/** Score, places, prizes — once. Unwon prize XG goes back to the host. */
export async function finishBattle(battleId: string) {
  const battle = await db.liveBattle.findUnique({
    where: { id: battleId },
    include: { competitors: { orderBy: { position: "asc" } }, liveSession: { select: { roomName: true } } },
  });
  if (!battle || (battle.status !== "VOTING" && battle.status !== "IN_PROGRESS")) return;
  const { giftsByUser, votesByCompetitor } = await tallies(battleId);
  const totalGifts = [...giftsByUser.values()].reduce((a, b) => a + b, 0);
  const totalVotes = [...votesByCompetitor.values()].reduce((a, b) => a + b, 0);

  const scored = battle.competitors
    .map((c) => {
      const giftsXg = giftsByUser.get(c.userId) ?? 0;
      const votes = votesByCompetitor.get(c.id) ?? 0;
      const score = (totalGifts ? (50 * giftsXg) / totalGifts : 0) + (totalVotes ? (50 * votes) / totalVotes : 0);
      return { ...c, giftsXg, votes, score: Math.round(score * 10) / 10 };
    })
    // Ties: more gift XG first, then whoever performed first.
    .sort((a, b) => b.score - a.score || b.giftsXg - a.giftsXg || a.position - b.position);

  const now = new Date();
  await db.$transaction(async (tx) => {
    const { count } = await tx.liveBattle.updateMany({
      where: { id: battleId, status: { in: ["VOTING", "IN_PROGRESS"] } },
      data: { status: "FINISHED", finishedAt: now, currentTurnId: null },
    });
    if (count === 0) return; // someone else finished it a moment ago
    await tx.liveBattleTurn.updateMany({ where: { battleId, endedAt: null }, data: { endedAt: now } });

    let awarded = 0;
    for (const [i, c] of scored.entries()) {
      const prizeXg = battle.prizePlaces[i] ?? 0;
      await tx.liveBattleCompetitor.update({
        where: { id: c.id },
        data: { giftsXg: c.giftsXg, votes: c.votes, score: c.score, place: i + 1, prizeXg },
      });
      if (prizeXg > 0) {
        await creditCreatorXg(tx, { creatorId: c.userId, xgAmount: prizeXg, source: "BATTLE_PRIZE", liveSessionId: battle.liveSessionId });
        awarded += prizeXg;
      }
    }
    const unawarded = battle.prizeXg - awarded;
    if (unawarded > 0) await tx.coinLedgerEntry.create({ data: { userId: battle.hostId, xgAmount: unawarded, kind: "BATTLE_PRIZE_REFUND" } });
  });
  await announce(battle.liveSession.roomName, "finished", battleId);
}

export async function finishVoting(liveSessionId: string, hostId: string) {
  await requireHost(liveSessionId, hostId);
  const battle = await activeBattle(liveSessionId);
  if (!battle || battle.status !== "VOTING") throw new BattleError("Voting isn't open", 409);
  await finishBattle(battle.id);
}

/** Host cancels; any prize already held goes back to them. */
export async function cancelBattle(liveSessionId: string, hostId: string | null) {
  const session = await loadLive(liveSessionId);
  if (hostId && session.creatorId !== hostId) throw new BattleError("Only the host can cancel the battle", 403);
  const battle = await activeBattle(liveSessionId);
  if (!battle) return;
  await db.$transaction(async (tx) => {
    const { count } = await tx.liveBattle.updateMany({
      where: { id: battle.id, status: { in: [...ACTIVE] } },
      data: { status: "CANCELLED", finishedAt: new Date(), currentTurnId: null },
    });
    if (count === 0) return;
    await tx.liveBattleTurn.updateMany({ where: { battleId: battle.id, endedAt: null }, data: { endedAt: new Date() } });
    await tx.liveBattleInvite.updateMany({ where: { battleId: battle.id, status: "PENDING" }, data: { status: "EXPIRED", respondedAt: new Date() } });
    if (battle.status !== "READY" && battle.prizeXg > 0) {
      await tx.coinLedgerEntry.create({ data: { userId: battle.hostId, xgAmount: battle.prizeXg, kind: "BATTLE_PRIZE_REFUND" } });
    }
  });
  await announce(session.roomName, "cancelled", battle.id);
}

/** When a Live ends mid-battle: voting finishes normally; anything earlier is cancelled and refunded. */
export async function settleBattlesOnLiveEnd(liveSessionId: string) {
  const battle = await activeBattle(liveSessionId);
  if (!battle) return;
  if (battle.status === "VOTING") await finishBattle(battle.id);
  else await cancelBattle(liveSessionId, null);
}

// ─── Reading ────────────────────────────────────────────────────────────

const PERSON = { id: true, handle: true, displayName: true, avatarUrl: true } as const;

async function supportersFor(battleId: string, recipientIds: string[]) {
  const rows = await db.liveGift.groupBy({
    by: ["recipientId", "senderId"],
    where: { battleId, recipientId: { in: recipientIds } },
    _sum: { xgAmount: true },
  });
  const people = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.senderId))] } }, select: PERSON });
  const byId = new Map(people.map((p) => [p.id, p]));
  const out = new Map<string, { person: { id: string; handle: string; displayName: string; avatarUrl: string | null }; xg: number }[]>();
  for (const r of rows) {
    const list = out.get(r.recipientId ?? "") ?? [];
    const person = byId.get(r.senderId);
    if (person) list.push({ person, xg: r._sum.xgAmount ?? 0 });
    out.set(r.recipientId ?? "", list);
  }
  for (const list of out.values()) list.sort((a, b) => b.xg - a.xg);
  return out;
}

/** Full battle view: competitors with live gift totals and supporters, turns, timer, vote state, results. */
export async function describeBattle(battleId: string, viewerId: string | null) {
  await settleExpired(battleId);
  const battle = await db.liveBattle.findUnique({
    where: { id: battleId },
    include: {
      competitors: { orderBy: { position: "asc" }, include: { user: { select: PERSON } } },
      turns: { orderBy: { startedAt: "asc" } },
      invites: { where: { status: { in: ["PENDING", "DECLINED"] } }, include: { user: { select: PERSON } }, orderBy: { createdAt: "asc" } },
      host: { select: PERSON },
      liveSession: { select: { id: true, title: true } },
    },
  });
  if (!battle) return null;
  const finished = battle.status === "FINISHED";
  const { giftsByUser, votesByCompetitor } = await tallies(battleId);
  const supporters = await supportersFor(battleId, battle.competitors.map((c) => c.userId));
  const myVote = viewerId
    ? await db.liveBattleVote.findUnique({ where: { battleId_voterId: { battleId, voterId: viewerId } }, select: { competitorId: true } })
    : null;
  const currentTurn = battle.currentTurnId ? battle.turns.find((t) => t.id === battle.currentTurnId) ?? null : null;
  const turnsDone = battle.turns.length;

  return {
    id: battle.id,
    liveSessionId: battle.liveSessionId,
    liveTitle: battle.liveSession.title,
    title: battle.title,
    status: battle.status,
    host: battle.host,
    rounds: battle.rounds,
    turnSeconds: battle.turnSeconds,
    votingSeconds: battle.votingSeconds,
    prizePlaces: battle.prizePlaces,
    prizeXg: battle.prizeXg,
    startedAt: battle.startedAt?.toISOString() ?? null,
    finishedAt: battle.finishedAt?.toISOString() ?? null,
    votingEndsAt: battle.votingEndsAt?.toISOString() ?? null,
    currentTurn: currentTurn
      ? { id: currentTurn.id, competitorId: currentTurn.competitorId, round: currentTurn.round, startedAt: currentTurn.startedAt.toISOString(), endsAt: currentTurn.endsAt.toISOString() }
      : null,
    // Next up / done — so the host's screen knows what the next button does.
    turnsDone,
    turnsTotal: battle.rounds * battle.competitors.length,
    myVoteCompetitorId: myVote?.competitorId ?? null,
    canVote: !!viewerId && viewerId !== battle.hostId && !battle.competitors.some((c) => c.userId === viewerId),
    competitors: battle.competitors.map((c) => ({
      id: c.id,
      user: c.user,
      position: c.position,
      giftsXg: finished ? c.giftsXg : (giftsByUser.get(c.userId) ?? 0),
      // Vote counts stay hidden until the result, so they don't sway the vote.
      votes: finished ? c.votes : null,
      score: finished ? c.score : null,
      place: c.place,
      prizeXg: c.prizeXg,
      supporters: (supporters.get(c.userId) ?? []).slice(0, 10),
      supporterCount: (supporters.get(c.userId) ?? []).length,
    })),
    turns: battle.turns.map((t) => ({
      id: t.id,
      competitorId: t.competitorId,
      round: t.round,
      startedAt: t.startedAt.toISOString(),
      endedAt: t.endedAt?.toISOString() ?? null,
      seconds: t.endedAt ? Math.round((t.endedAt.getTime() - t.startedAt.getTime()) / 1000) : null,
    })),
    totalVotes: finished ? [...votesByCompetitor.values()].reduce((a, b) => a + b, 0) : null,
    // Invites still ringing (or turned down) while the battle is being set up.
    invites:
      battle.status === "READY"
        ? battle.invites.map((i) => ({
            id: i.id,
            user: i.user,
            status: i.status === "PENDING" && i.createdAt.getTime() < Date.now() - INVITE_TTL_MS ? ("EXPIRED" as const) : i.status,
          }))
        : [],
    serverTime: new Date().toISOString(),
  };
}

/** The battle a Live is running now, or the one it just finished (for the results card). */
export async function getLiveBattle(liveSessionId: string, viewerId: string | null) {
  const battle = await db.liveBattle.findFirst({
    where: { liveSessionId, status: { not: "CANCELLED" } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return battle ? describeBattle(battle.id, viewerId) : null;
}

/** Past battles in one Live — the results list. */
export async function listBattles(liveSessionId: string) {
  return db.liveBattle.findMany({
    where: { liveSessionId, status: "FINISHED" },
    orderBy: { finishedAt: "desc" },
    select: { id: true, title: true, finishedAt: true },
  });
}

export function battleErrorResponse(err: unknown): { status: number; error: string } | null {
  if (err instanceof BattleError) return { status: err.status, error: err.message };
  return null;
}

// ─── Invites (explicit ask, 2026-10-08) ─────────────────────────────────
// The host invites mutual followers; their phone rings with the battle's
// details. Accepting makes them a competitor and tells their followers to
// come and support them.

/** How long an invite keeps ringing. */
export const INVITE_TTL_MS = 5 * 60_000;

/** Of `candidateIds`, the ones who follow the host and whom the host follows. */
async function mutualFollowerIds(hostId: string, candidateIds: string[]) {
  const rows = await db.user.findMany({
    where: {
      id: { in: candidateIds },
      deletedAt: null,
      followers: { some: { followerId: hostId } },
      following: { some: { followedId: hostId } },
    },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/** People the host can invite: everyone they follow who follows them back. */
export async function listInvitable(liveSessionId: string, hostId: string) {
  await requireHost(liveSessionId, hostId);
  return db.user.findMany({
    where: {
      id: { not: hostId },
      deletedAt: null,
      followers: { some: { followerId: hostId } },
      following: { some: { followedId: hostId } },
    },
    select: PERSON,
    orderBy: { displayName: "asc" },
    take: 200,
  });
}

function fmtClock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const INVITE_INCLUDE = {
  user: { select: PERSON },
  battle: {
    include: {
      host: { select: PERSON },
      competitors: { include: { user: { select: PERSON } }, orderBy: { position: "asc" as const } },
      invites: { where: { status: { in: ["PENDING", "ACCEPTED"] as ("PENDING" | "ACCEPTED")[] } }, include: { user: { select: PERSON } } },
    },
  },
};

type InviteRow = NonNullable<Awaited<ReturnType<typeof loadInvite>>>;

function loadInvite(inviteId: string) {
  return db.liveBattleInvite.findUnique({ where: { id: inviteId }, include: INVITE_INCLUDE });
}

/** What the ringing screen shows: who's inviting, everyone in it, and the battle's settings. */
function ringPayload(invite: InviteRow) {
  const b = invite.battle;
  // Everyone taking part: already-picked competitors plus everyone invited.
  const seen = new Set<string>();
  const people = [...b.competitors.map((c) => c.user), ...b.invites.map((i) => i.user)].filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  return {
    id: invite.id,
    status: invite.status,
    expiresAt: new Date(invite.createdAt.getTime() + INVITE_TTL_MS).toISOString(),
    liveSessionId: b.liveSessionId,
    host: b.host,
    battle: {
      id: b.id,
      title: b.title,
      status: b.status,
      rounds: b.rounds,
      turnSeconds: b.turnSeconds,
      votingSeconds: b.votingSeconds,
      prizePlaces: b.prizePlaces,
      prizeXg: b.prizeXg,
    },
    people,
  };
}

export type BattleInviteRing = ReturnType<typeof ringPayload>;

/** Pushes the ring to everyone invited to this battle (one push each — the link carries their own invite). */
async function ringInvitees(battleId: string) {
  const invites = await db.liveBattleInvite.findMany({ where: { battleId, status: "PENDING" }, include: INVITE_INCLUDE });
  for (const invite of invites) {
    const ring = ringPayload(invite);
    const others = ring.people.filter((p) => p.id !== invite.userId).map((p) => `@${p.handle}`);
    const prize = ring.battle.prizeXg > 0 ? ` · ${ring.battle.prizeXg.toLocaleString("en-NG")} XG prize` : "";
    notifyUsersAfterResponse([invite.userId], {
      kind: "LIVE",
      title: `⚔️ ${ring.host.displayName} is inviting you to a battle`,
      body: `${ring.battle.title}${others.length ? ` · with ${others.join(", ")}` : ""} · ${ring.battle.rounds} round${ring.battle.rounds === 1 ? "" : "s"} · ${fmtClock(ring.battle.turnSeconds)} per turn${prize}`,
      url: `/live/${ring.liveSessionId}?battleInvite=${invite.id}`,
      icon: ring.host.avatarUrl ?? undefined,
      tag: `battle-invite-${invite.id}`,
    });
  }
}

/** The invite for its ring screen (only the person invited can see it). */
export async function getInvite(inviteId: string, userId: string) {
  const invite = await loadInvite(inviteId);
  if (!invite || invite.userId !== userId) return null;
  return ringPayload(invite);
}

/**
 * The newest invite still ringing for this user — rides along the in-app
 * message poll (GET /api/messages/latest), so the ring also shows for anyone
 * whose push didn't arrive. One indexed lookup; usually finds nothing.
 */
export async function pendingInviteFor(userId: string) {
  const invite = await db.liveBattleInvite.findFirst({
    where: { userId, status: "PENDING", createdAt: { gt: new Date(Date.now() - INVITE_TTL_MS) }, battle: { status: "READY" } },
    orderBy: { createdAt: "desc" },
    include: INVITE_INCLUDE,
  });
  return invite ? ringPayload(invite) : null;
}

/** Accept or decline. Accepting adds them as a competitor and calls their followers in to support them. */
export async function respondToInvite(inviteId: string, userId: string, accept: boolean) {
  const invite = await loadInvite(inviteId);
  if (!invite || invite.userId !== userId) throw new BattleError("Invite not found", 404);
  if (invite.status !== "PENDING") throw new BattleError("You've already answered this invite", 409);
  const lapsed = invite.createdAt.getTime() < Date.now() - INVITE_TTL_MS;
  if (invite.battle.status !== "READY" || lapsed) {
    await db.liveBattleInvite.updateMany({ where: { id: inviteId, status: "PENDING" }, data: { status: "EXPIRED", respondedAt: new Date() } });
    throw new BattleError(invite.battle.status === "READY" ? "This invite has expired" : "That battle has already started", 409);
  }

  await db.$transaction(async (tx) => {
    const { count } = await tx.liveBattleInvite.updateMany({
      where: { id: inviteId, status: "PENDING" },
      data: { status: accept ? "ACCEPTED" : "DECLINED", respondedAt: new Date() },
    });
    if (count === 0) throw new BattleError("You've already answered this invite", 409);
    if (!accept) return;
    const competitors = await tx.liveBattleCompetitor.count({ where: { battleId: invite.battleId } });
    if (competitors >= BATTLE_LIMITS.maxCompetitors) throw new BattleError("The battle is already full", 409);
    await tx.liveBattleCompetitor.create({ data: { battleId: invite.battleId, userId, position: competitors } });
  });

  const session = await db.liveSession.findUnique({ where: { id: invite.battle.liveSessionId }, select: { roomName: true } });
  await announce(session?.roomName ?? null, accept ? "invite-accepted" : "invite-declined", invite.battleId);

  if (accept) {
    const target = { liveSessionId: invite.battle.liveSessionId, hostId: invite.battle.hostId, battleTitle: invite.battle.title };
    // Already in the room? Bring them up now (otherwise Start does it) —
    // that also alerts their followers, minus anyone already watching.
    await inviteToStage({ ...target, actorId: target.hostId, targetUserId: userId }).catch(() => {});
    // Not in the room yet: tell their followers now anyway ("X is live with
    // Host in a battle"). A no-op if the line above already did.
    await alertGuestFollowers({ ...target, guestId: userId });
  }
  return { liveSessionId: invite.battle.liveSessionId };
}
