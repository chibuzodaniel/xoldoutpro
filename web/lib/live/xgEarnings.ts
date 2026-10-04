// Creators' earned XG (explicit asks, 2026-10-04): "₦6 per XG but super
// moderator can edit — everything received should go to XG balance", then
// "make the payout for live coins 1 week for now and can be changed later by
// super admins" (replacing the original once-a-month payout).
//
// Every XG a creator receives (gift, paid access, paid request) lands here
// as an XgEarning row, valued at PlatformSettings.xgPayoutRateKobo *at the
// moment it's received* — so a later rate edit never re-values XG already
// earned. Each row is held for PlatformSettings.xgPayoutHoldDays (7 to start)
// and then paid into the creator's wallet as part of one XG_EARNINGS_PAYOUT
// credit per creator per run, where the normal withdrawal flow takes over.
//
// The hold is read live, not snapshotted: changing it moves the payout date
// of XG that's still being held, in either direction. The conversion cron
// runs once a day, so a row becomes withdrawable on the first run after its
// hold ends (at most a day later), and a failed run is simply picked up by
// the next one.

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

type DbClient = Prisma.TransactionClient | typeof db;

export const DEFAULT_XG_PAYOUT_RATE_KOBO = 600; // ₦6 per XG
export const DEFAULT_XG_PAYOUT_HOLD_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

async function getXgSettings(client: DbClient = db) {
  const row = await client.platformSettings.findUnique({
    where: { id: "singleton" },
    select: { xgPayoutRateKobo: true, xgPayoutHoldDays: true },
  });
  return {
    rateKobo: row?.xgPayoutRateKobo ?? DEFAULT_XG_PAYOUT_RATE_KOBO,
    holdDays: row?.xgPayoutHoldDays ?? DEFAULT_XG_PAYOUT_HOLD_DAYS,
  };
}

export async function getXgPayoutRateKobo(client: DbClient = db): Promise<number> {
  return (await getXgSettings(client)).rateKobo;
}

/** The seller side of an XG spend — run inside the same transaction as the spender's debitCoins. */
export async function creditCreatorXg(
  tx: Prisma.TransactionClient,
  args: { creatorId: string; xgAmount: number; source: "LIVE_GIFT" | "LIVE_ACCESS" | "LIVE_REQUEST"; liveSessionId: string },
): Promise<void> {
  const koboPerXg = await getXgPayoutRateKobo(tx);
  await tx.xgEarning.create({
    data: {
      userId: args.creatorId,
      xgAmount: args.xgAmount,
      koboPerXg,
      source: args.source,
      liveSessionId: args.liveSessionId,
    },
  });
}

/** XG received before this instant has finished its hold and is due for payout. */
export function xgHoldCutoff(now: Date, holdDays: number): Date {
  return new Date(now.getTime() - holdDays * DAY_MS);
}

/**
 * What the wallet screens show: XG still being held, its Naira value, and
 * the next payout — when the oldest held XG finishes its hold, and how much
 * becomes withdrawable then (everything received on that same day).
 */
export async function getXgEarningsSummary(userId: string, now = new Date()) {
  const [{ rateKobo, holdDays }, rows] = await Promise.all([
    getXgSettings(),
    db.xgEarning.findMany({
      where: { userId, convertedAt: null },
      orderBy: { createdAt: "asc" },
      select: { xgAmount: true, koboPerXg: true, createdAt: true },
    }),
  ]);
  let xg = 0;
  let kobo = 0;
  for (const r of rows) {
    xg += r.xgAmount;
    kobo += r.xgAmount * r.koboPerXg;
  }

  let nextPayout: { at: string; xg: number; kobo: number } | null = null;
  if (rows.length > 0) {
    // Already-due rows (hold over, cron not run yet) pay on the next run;
    // otherwise the next payout is the oldest row's hold ending.
    const firstDue = Math.max(rows[0].createdAt.getTime() + holdDays * DAY_MS, now.getTime());
    const batchEnd = firstDue - holdDays * DAY_MS + DAY_MS;
    let batchXg = 0;
    let batchKobo = 0;
    for (const r of rows) {
      if (r.createdAt.getTime() >= batchEnd) break;
      batchXg += r.xgAmount;
      batchKobo += r.xgAmount * r.koboPerXg;
    }
    nextPayout = { at: new Date(firstDue).toISOString(), xg: batchXg, kobo: batchKobo };
  }

  return {
    balanceXg: xg,
    balanceKobo: kobo,
    nextPayoutAt: nextPayout?.at ?? null,
    nextPayoutXg: nextPayout?.xg ?? 0,
    nextPayoutKobo: nextPayout?.kobo ?? 0,
    holdDays,
    rateKobo,
  };
}

/**
 * Pays every unconverted XgEarning whose hold has ended into its creator's
 * wallet. Idempotent per creator: rows are re-read under an advisory lock on
 * the creator's id and marked converted in the same transaction that writes
 * the wallet credit, so overlapping runs can't pay the same row twice.
 */
export async function convertDueXgEarnings(now = new Date()): Promise<{ creators: number; xg: number; kobo: number }> {
  const { holdDays } = await getXgSettings();
  const cutoff = xgHoldCutoff(now, holdDays);
  const due = await db.xgEarning.groupBy({
    by: ["userId"],
    where: { convertedAt: null, createdAt: { lte: cutoff } },
  });

  let creators = 0;
  let totalXg = 0;
  let totalKobo = 0;
  for (const { userId } of due) {
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"xg-convert:" + userId}))`;
      const rows = await tx.xgEarning.findMany({
        where: { userId, convertedAt: null, createdAt: { lte: cutoff } },
        select: { id: true, xgAmount: true, koboPerXg: true },
      });
      if (rows.length === 0) return null;

      const xg = rows.reduce((sum, r) => sum + r.xgAmount, 0);
      const kobo = rows.reduce((sum, r) => sum + r.xgAmount * r.koboPerXg, 0);
      const credit = await tx.walletLedgerEntry.create({
        data: { userId, amountKobo: kobo, kind: "XG_EARNINGS_PAYOUT", status: "AVAILABLE" },
      });
      await tx.xgEarning.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { convertedAt: now, walletLedgerEntryId: credit.id },
      });
      return { xg, kobo };
    });
    if (result) {
      creators += 1;
      totalXg += result.xg;
      totalKobo += result.kobo;
    }
  }
  return { creators, xg: totalXg, kobo: totalKobo };
}

/** Total Naira value of every XG ever earned, converted or not — the platform's Live payout liability. */
export async function getTotalXgEarnedKobo(client: DbClient = db): Promise<number> {
  const rows = await client.$queryRaw<{ total: bigint | null }[]>`
    SELECT SUM("xgAmount"::bigint * "koboPerXg") AS total FROM "XgEarning"
  `;
  return Number(rows[0]?.total ?? 0);
}

export type Gifter = {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  giftsCount: number;
  xg: number;
  kobo: number;
};

export type LiveXgStats = {
  id: string;
  title: string;
  status: "LIVE" | "ENDED";
  startedAt: string;
  endedAt: string | null;
  peakViewers: number;
  giftsCount: number;
  giftsXg: number;
  giftsKobo: number;
  accessCount: number;
  accessXg: number;
  accessKobo: number;
  requestsCount: number;
  requestsXg: number;
  requestsKobo: number;
  totalXg: number;
  earnedKobo: number;
  // Everyone who sent a gift on this Live, biggest first — gifters[0] is the
  // Live's top gifter.
  gifters: Gifter[];
};

// XG received before XgEarning existed (2026-10-04) was paid straight into
// the wallet at a flat ₦1/XG — used only to value any such leftover XG.
const LEGACY_KOBO_PER_XG = 100;

/**
 * Per-Live breakdown for the creator's XG balance page (explicit asks,
 * 2026-10-04: "the creator should see the statistics of his live in the XG
 * balance page"; "the list should include who gifted and the top gifter
 * ... if it's 80 coins the amount in Naira should be there"). XG counts
 * come from the gift/access/request tables themselves; Naira comes from
 * XgEarning, i.e. the rate actually in force when each XG was received.
 * A gifter's Naira is their share of the Live's gift earnings, which is
 * exact unless a moderator changed the rate mid-Live.
 */
export async function getLiveXgStats(creatorId: string, limit = 50): Promise<LiveXgStats[]> {
  const sessions = await db.liveSession.findMany({
    where: { creatorId, status: { in: ["LIVE", "ENDED"] } },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: { id: true, title: true, status: true, startedAt: true, endedAt: true, peakViewers: true },
  });
  if (sessions.length === 0) return [];
  const ids = sessions.map((s) => s.id);

  const [gifts, access, requests, earned, giftsBySender] = await Promise.all([
    db.liveGift.groupBy({ by: ["liveSessionId"], where: { liveSessionId: { in: ids } }, _count: true, _sum: { xgAmount: true } }),
    db.liveAccessGrant.groupBy({ by: ["liveSessionId"], where: { liveSessionId: { in: ids } }, _count: true, _sum: { xgPaid: true } }),
    db.liveRequest.groupBy({ by: ["liveSessionId"], where: { liveSessionId: { in: ids } }, _count: true, _sum: { xgAmount: true } }),
    db.xgEarning.findMany({
      where: { userId: creatorId, liveSessionId: { in: ids } },
      select: { liveSessionId: true, source: true, xgAmount: true, koboPerXg: true },
    }),
    db.liveGift.groupBy({
      by: ["liveSessionId", "senderId"],
      where: { liveSessionId: { in: ids } },
      _count: true,
      _sum: { xgAmount: true },
    }),
  ]);

  const senders = await db.user.findMany({
    where: { id: { in: [...new Set(giftsBySender.map((g) => g.senderId))] } },
    select: { id: true, handle: true, displayName: true, avatarUrl: true },
  });
  const senderById = new Map(senders.map((u) => [u.id, u]));

  const giftsBy = new Map(gifts.map((g) => [g.liveSessionId, g]));
  const accessBy = new Map(access.map((a) => [a.liveSessionId, a]));
  const requestsBy = new Map(requests.map((r) => [r.liveSessionId, r]));
  // "<sessionId>:<source>" -> XG and Naira actually earned from that source.
  const earnedBy = new Map<string, { xg: number; kobo: number }>();
  for (const e of earned) {
    if (!e.liveSessionId) continue;
    const key = `${e.liveSessionId}:${e.source}`;
    const cur = earnedBy.get(key) ?? { xg: 0, kobo: 0 };
    earnedBy.set(key, { xg: cur.xg + e.xgAmount, kobo: cur.kobo + e.xgAmount * e.koboPerXg });
  }
  // Naira for `xg` XG of one source: whatever XgEarning recorded, plus any
  // XG it doesn't cover (pre-XgEarning) at the legacy flat rate.
  function koboFor(sessionId: string, source: string, xg: number) {
    const e = earnedBy.get(`${sessionId}:${source}`) ?? { xg: 0, kobo: 0 };
    return e.kobo + Math.max(0, xg - e.xg) * LEGACY_KOBO_PER_XG;
  }

  const giftersBy = new Map<string, Gifter[]>();
  for (const g of giftsBySender) {
    const user = senderById.get(g.senderId);
    const list = giftersBy.get(g.liveSessionId) ?? [];
    list.push({
      userId: g.senderId,
      handle: user?.handle ?? "",
      displayName: user?.displayName ?? "Deleted user",
      avatarUrl: user?.avatarUrl ?? null,
      giftsCount: g._count,
      xg: g._sum.xgAmount ?? 0,
      kobo: 0, // filled in below, once the Live's own gift total is known
    });
    giftersBy.set(g.liveSessionId, list);
  }

  return sessions.map((s) => {
    const g = giftsBy.get(s.id);
    const a = accessBy.get(s.id);
    const r = requestsBy.get(s.id);
    const giftsXg = g?._sum.xgAmount ?? 0;
    const accessXg = a?._sum.xgPaid ?? 0;
    const requestsXg = r?._sum.xgAmount ?? 0;
    const giftsKobo = koboFor(s.id, "LIVE_GIFT", giftsXg);
    const accessKobo = koboFor(s.id, "LIVE_ACCESS", accessXg);
    const requestsKobo = koboFor(s.id, "LIVE_REQUEST", requestsXg);

    const gifters = (giftersBy.get(s.id) ?? [])
      .map((gf) => ({ ...gf, kobo: giftsXg > 0 ? Math.round((gf.xg / giftsXg) * giftsKobo) : 0 }))
      .sort((x, y) => y.xg - x.xg);

    return {
      id: s.id,
      title: s.title,
      status: s.status as "LIVE" | "ENDED",
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      peakViewers: s.peakViewers,
      giftsCount: g?._count ?? 0,
      giftsXg,
      giftsKobo,
      accessCount: a?._count ?? 0,
      accessXg,
      accessKobo,
      requestsCount: r?._count ?? 0,
      requestsXg,
      requestsKobo,
      totalXg: giftsXg + accessXg + requestsXg,
      earnedKobo: giftsKobo + accessKobo + requestsKobo,
      gifters,
    };
  });
}

/** The creator's biggest gifter across the given Lives (by XG sent), or null. */
export function topGifterAcross(lives: LiveXgStats[]): Gifter | null {
  const byUser = new Map<string, Gifter>();
  for (const live of lives) {
    for (const g of live.gifters) {
      const cur = byUser.get(g.userId);
      byUser.set(
        g.userId,
        cur ? { ...cur, giftsCount: cur.giftsCount + g.giftsCount, xg: cur.xg + g.xg, kobo: cur.kobo + g.kobo } : { ...g },
      );
    }
  }
  let top: Gifter | null = null;
  for (const g of byUser.values()) if (!top || g.xg > top.xg) top = g;
  return top;
}

/** Past monthly conversions, newest first — the XG balance page's payout history. */
export async function getXgPayoutHistory(userId: string, limit = 12) {
  const credits = await db.walletLedgerEntry.findMany({
    where: { userId, kind: "XG_EARNINGS_PAYOUT" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, amountKobo: true, createdAt: true },
  });
  if (credits.length === 0) return [];
  const xgBy = await db.xgEarning.groupBy({
    by: ["walletLedgerEntryId"],
    where: { walletLedgerEntryId: { in: credits.map((c) => c.id) } },
    _sum: { xgAmount: true },
  });
  const xgById = new Map(xgBy.map((x) => [x.walletLedgerEntryId, x._sum.xgAmount ?? 0]));
  return credits.map((c) => ({ id: c.id, amountKobo: c.amountKobo, xg: xgById.get(c.id) ?? 0, createdAt: c.createdAt.toISOString() }));
}

export type LiveSupporter = {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  giftsCount: number;
  giftsXg: number;
  accessXg: number;
  requestsCount: number;
  requestsXg: number;
  totalXg: number;
  kobo: number;
};

type SourceTotals = { xg: number; kobo: number; count: number };

/**
 * One Live's support, for the host's tappable "supporters" and "XG" chips
 * (explicit ask, 2026-10-04: "the supporters tab in the live should be
 * clickable to see people who support you, and the total coins received
 * clickable to see the stats of the coins received in the stream"). Read
 * from the gift/access/request tables, so it's complete even if the host's
 * page reloaded mid-Live; Naira per source comes from XgEarning (the rate in
 * force when each XG arrived), and a supporter's Naira is their share of
 * each source — exact unless the rate changed mid-Live.
 */
export async function getLiveSupport(liveSessionId: string) {
  const [gifts, access, requests, earned] = await Promise.all([
    db.liveGift.findMany({ where: { liveSessionId }, select: { senderId: true, type: true, xgAmount: true, createdAt: true } }),
    db.liveAccessGrant.findMany({ where: { liveSessionId }, select: { userId: true, xgPaid: true } }),
    db.liveRequest.findMany({ where: { liveSessionId }, select: { senderId: true, xgAmount: true } }),
    db.xgEarning.findMany({ where: { liveSessionId }, select: { source: true, xgAmount: true, koboPerXg: true } }),
  ]);

  const earnedBy: Record<string, { xg: number; kobo: number }> = {};
  for (const e of earned) {
    const cur = earnedBy[e.source] ?? { xg: 0, kobo: 0 };
    earnedBy[e.source] = { xg: cur.xg + e.xgAmount, kobo: cur.kobo + e.xgAmount * e.koboPerXg };
  }
  const totals = (source: string, xg: number, count: number): SourceTotals => {
    const e = earnedBy[source] ?? { xg: 0, kobo: 0 };
    return { xg, count, kobo: e.kobo + Math.max(0, xg - e.xg) * LEGACY_KOBO_PER_XG };
  };
  const giftTotals = totals("LIVE_GIFT", gifts.reduce((s, g) => s + g.xgAmount, 0), gifts.length);
  const accessTotals = totals("LIVE_ACCESS", access.reduce((s, a) => s + a.xgPaid, 0), access.length);
  const requestTotals = totals("LIVE_REQUEST", requests.reduce((s, r) => s + r.xgAmount, 0), requests.length);
  const share = (xg: number, t: SourceTotals) => (t.xg > 0 ? (xg / t.xg) * t.kobo : 0);

  const byUser = new Map<string, { giftsCount: number; giftsXg: number; accessXg: number; requestsCount: number; requestsXg: number }>();
  const row = (id: string) => {
    let r = byUser.get(id);
    if (!r) byUser.set(id, (r = { giftsCount: 0, giftsXg: 0, accessXg: 0, requestsCount: 0, requestsXg: 0 }));
    return r;
  };
  for (const g of gifts) {
    const r = row(g.senderId);
    r.giftsCount += 1;
    r.giftsXg += g.xgAmount;
  }
  for (const a of access) row(a.userId).accessXg += a.xgPaid;
  for (const q of requests) {
    const r = row(q.senderId);
    r.requestsCount += 1;
    r.requestsXg += q.xgAmount;
  }

  const users = await db.user.findMany({
    where: { id: { in: [...byUser.keys()] } },
    select: { id: true, handle: true, displayName: true, avatarUrl: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));
  const supporters: LiveSupporter[] = [...byUser.entries()]
    .map(([userId, r]) => {
      const u = userById.get(userId);
      return {
        userId,
        handle: u?.handle ?? "",
        displayName: u?.displayName ?? "Deleted user",
        avatarUrl: u?.avatarUrl ?? null,
        ...r,
        totalXg: r.giftsXg + r.accessXg + r.requestsXg,
        kobo: Math.round(share(r.giftsXg, giftTotals) + share(r.accessXg, accessTotals) + share(r.requestsXg, requestTotals)),
      };
    })
    .sort((a, b) => b.totalXg - a.totalXg);

  const byGiftType: Record<string, { count: number; xg: number }> = {};
  for (const g of gifts) {
    const cur = byGiftType[g.type] ?? { count: 0, xg: 0 };
    byGiftType[g.type] = { count: cur.count + 1, xg: cur.xg + g.xgAmount };
  }

  return {
    totalXg: giftTotals.xg + accessTotals.xg + requestTotals.xg,
    totalKobo: giftTotals.kobo + accessTotals.kobo + requestTotals.kobo,
    gifts: giftTotals,
    access: accessTotals,
    requests: requestTotals,
    giftTypes: Object.entries(byGiftType)
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.xg - a.xg),
    supporters,
  };
}
