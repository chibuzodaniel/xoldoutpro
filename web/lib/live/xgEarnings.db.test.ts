import { randomUUID } from "crypto";
import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { creditCreatorXg, convertDueXgEarnings, getXgEarningsSummary, getLiveXgStats } from "./xgEarnings";

// Integration test against the real local Postgres (`npx prisma dev`), same
// convention and cleanup discipline as lib/commerce/stock.test.ts.
const userIds: string[] = [];
const sessionIds: string[] = [];
let originalRate: number | null | undefined;

async function makeCreatorWithLive() {
  const creator = await db.user.create({
    data: { firebaseUid: randomUUID(), email: `${randomUUID()}@test.local`, handle: randomUUID().slice(0, 12), displayName: "XG Test Creator" },
  });
  userIds.push(creator.id);
  const live = await db.liveSession.create({ data: { creatorId: creator.id, title: "XG Test Live", status: "ENDED", peakViewers: 7 } });
  sessionIds.push(live.id);
  return { creatorId: creator.id, liveSessionId: live.id };
}

async function setRate(kobo: number) {
  if (originalRate === undefined) {
    originalRate = (await db.platformSettings.findUnique({ where: { id: "singleton" } }))?.xgPayoutRateKobo ?? null;
  }
  await db.platformSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton", xgPayoutRateKobo: kobo }, update: { xgPayoutRateKobo: kobo } });
}

afterEach(async () => {
  await db.xgEarning.deleteMany({ where: { userId: { in: userIds } } });
  await db.walletLedgerEntry.deleteMany({ where: { userId: { in: userIds } } });
  await db.liveSession.deleteMany({ where: { id: { in: sessionIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  if (originalRate !== undefined) {
    if (originalRate === null) await db.platformSettings.update({ where: { id: "singleton" }, data: { xgPayoutRateKobo: 600 } });
    else await db.platformSettings.update({ where: { id: "singleton" }, data: { xgPayoutRateKobo: originalRate } });
  }
  userIds.length = 0;
  sessionIds.length = 0;
  originalRate = undefined;
});

describe("XG earnings", () => {
  it("snapshots the rate at receipt and converts only previous months, exactly once", async () => {
    const { creatorId, liveSessionId } = await makeCreatorWithLive();

    await setRate(600);
    await db.$transaction((tx) => creditCreatorXg(tx, { creatorId, xgAmount: 500, source: "LIVE_GIFT", liveSessionId }));
    // A moderator raises the rate: XG already earned keeps its ₦6 value.
    await setRate(800);
    await db.$transaction((tx) => creditCreatorXg(tx, { creatorId, xgAmount: 100, source: "LIVE_REQUEST", liveSessionId }));

    const before = await getXgEarningsSummary(creatorId);
    expect(before.balanceXg).toBe(600);
    expect(before.balanceKobo).toBe(500 * 600 + 100 * 800);

    // Same month: nothing is due yet.
    expect((await convertDueXgEarnings()).creators).toBe(0);

    // Backdate the ₦6 gift into last month; only it should convert.
    await db.xgEarning.updateMany({ where: { userId: creatorId, source: "LIVE_GIFT" }, data: { createdAt: new Date(Date.now() - 40 * 86400_000) } });
    const run = await convertDueXgEarnings();
    expect(run).toMatchObject({ creators: 1, xg: 500, kobo: 300_000 });

    const credits = await db.walletLedgerEntry.findMany({ where: { userId: creatorId } });
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ kind: "XG_EARNINGS_PAYOUT", status: "AVAILABLE", amountKobo: 300_000 });

    // Running again pays nothing twice.
    expect((await convertDueXgEarnings()).creators).toBe(0);
    expect(await db.walletLedgerEntry.count({ where: { userId: creatorId } })).toBe(1);

    const after = await getXgEarningsSummary(creatorId);
    expect(after).toMatchObject({ balanceXg: 100, balanceKobo: 80_000 });

    const [stats] = await getLiveXgStats(creatorId);
    expect(stats).toMatchObject({ id: liveSessionId, peakViewers: 7, earnedKobo: 380_000 });
  });
});
