// Creators' earned XG (explicit ask, 2026-10-04): "₦6 per XG but super
// moderator can edit — everything received should go to XG balance and be
// withdrawable at the end of the month like Meta does."
//
// Every XG a creator receives (gift, paid access, paid request) lands here
// as an XgEarning row, valued at PlatformSettings.xgPayoutRateKobo *at the
// moment it's received* — so a later rate edit never re-values XG already
// earned. Once a month, every not-yet-converted row from before the current
// month (Lagos time) is paid into the creator's wallet as one
// XG_EARNINGS_PAYOUT credit, where the normal withdrawal flow takes over.
//
// The conversion cron runs daily, not just on the 1st: a run only ever
// touches rows from previous months, so the extra runs are no-ops, and a
// failed or skipped run on the 1st is simply picked up the next day.

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

type DbClient = Prisma.TransactionClient | typeof db;

export const DEFAULT_XG_PAYOUT_RATE_KOBO = 600; // ₦6 per XG

export async function getXgPayoutRateKobo(client: DbClient = db): Promise<number> {
  const row = await client.platformSettings.findUnique({ where: { id: "singleton" }, select: { xgPayoutRateKobo: true } });
  return row?.xgPayoutRateKobo ?? DEFAULT_XG_PAYOUT_RATE_KOBO;
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

// Nigeria is UTC+1 year-round (no DST), so "midnight on the 1st in Lagos"
// is always 23:00 UTC on the last day of the previous month.
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** Start of the Lagos-time calendar month containing `now`, as a UTC instant. */
export function lagosMonthStart(now: Date): Date {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  return new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), 1) - LAGOS_OFFSET_MS);
}

/** When XG earned right now becomes withdrawable: the start of next Lagos month. */
export function nextXgPayoutDate(now: Date): Date {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  return new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth() + 1, 1) - LAGOS_OFFSET_MS);
}

/** What the wallet screens show: unconverted earned XG, its Naira value, and when it pays out. */
export async function getXgEarningsSummary(userId: string, now = new Date()) {
  const rows = await db.xgEarning.findMany({
    where: { userId, convertedAt: null },
    select: { xgAmount: true, koboPerXg: true },
  });
  let xg = 0;
  let kobo = 0;
  for (const r of rows) {
    xg += r.xgAmount;
    kobo += r.xgAmount * r.koboPerXg;
  }
  return {
    balanceXg: xg,
    balanceKobo: kobo,
    nextPayoutAt: nextXgPayoutDate(now).toISOString(),
    rateKobo: await getXgPayoutRateKobo(),
  };
}

/**
 * Pays every unconverted XgEarning from before the current Lagos month into
 * its creator's wallet. Idempotent per creator: rows are re-read under an
 * advisory lock on the creator's id and marked converted in the same
 * transaction that writes the wallet credit, so overlapping runs can't pay
 * the same row twice.
 */
export async function convertDueXgEarnings(now = new Date()): Promise<{ creators: number; xg: number; kobo: number }> {
  const cutoff = lagosMonthStart(now);
  const due = await db.xgEarning.groupBy({
    by: ["userId"],
    where: { convertedAt: null, createdAt: { lt: cutoff } },
  });

  let creators = 0;
  let totalXg = 0;
  let totalKobo = 0;
  for (const { userId } of due) {
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"xg-convert:" + userId}))`;
      const rows = await tx.xgEarning.findMany({
        where: { userId, convertedAt: null, createdAt: { lt: cutoff } },
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

export type LiveXgStats = {
  id: string;
  title: string;
  status: "LIVE" | "ENDED";
  startedAt: string;
  endedAt: string | null;
  peakViewers: number;
  giftsCount: number;
  giftsXg: number;
  accessCount: number;
  accessXg: number;
  requestsCount: number;
  requestsXg: number;
  totalXg: number;
  earnedKobo: number;
};

/**
 * Per-Live breakdown for the creator's XG balance page (explicit ask,
 * 2026-10-04: "the creator should see the statistics of his live in the XG
 * balance page"). XG counts come from the gift/access/request tables
 * themselves (complete for every Live, including ones from before
 * XgEarning existed); earnedKobo comes from XgEarning, i.e. what each Live
 * actually adds to the creator's monthly payout at the rate in force then.
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

  const [gifts, access, requests, earned] = await Promise.all([
    db.liveGift.groupBy({ by: ["liveSessionId"], where: { liveSessionId: { in: ids } }, _count: true, _sum: { xgAmount: true } }),
    db.liveAccessGrant.groupBy({ by: ["liveSessionId"], where: { liveSessionId: { in: ids } }, _count: true, _sum: { xgPaid: true } }),
    db.liveRequest.groupBy({ by: ["liveSessionId"], where: { liveSessionId: { in: ids } }, _count: true, _sum: { xgAmount: true } }),
    db.xgEarning.findMany({ where: { userId: creatorId, liveSessionId: { in: ids } }, select: { liveSessionId: true, xgAmount: true, koboPerXg: true } }),
  ]);

  const giftsBy = new Map(gifts.map((g) => [g.liveSessionId, g]));
  const accessBy = new Map(access.map((a) => [a.liveSessionId, a]));
  const requestsBy = new Map(requests.map((r) => [r.liveSessionId, r]));
  const koboBy = new Map<string, number>();
  for (const e of earned) {
    if (!e.liveSessionId) continue;
    koboBy.set(e.liveSessionId, (koboBy.get(e.liveSessionId) ?? 0) + e.xgAmount * e.koboPerXg);
  }

  return sessions.map((s) => {
    const g = giftsBy.get(s.id);
    const a = accessBy.get(s.id);
    const r = requestsBy.get(s.id);
    const giftsXg = g?._sum.xgAmount ?? 0;
    const accessXg = a?._sum.xgPaid ?? 0;
    const requestsXg = r?._sum.xgAmount ?? 0;
    return {
      id: s.id,
      title: s.title,
      status: s.status as "LIVE" | "ENDED",
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      peakViewers: s.peakViewers,
      giftsCount: g?._count ?? 0,
      giftsXg,
      accessCount: a?._count ?? 0,
      accessXg,
      requestsCount: r?._count ?? 0,
      requestsXg,
      totalXg: giftsXg + accessXg + requestsXg,
      earnedKobo: koboBy.get(s.id) ?? 0,
    };
  });
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
