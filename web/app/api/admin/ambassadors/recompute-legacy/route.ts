import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getAmbassadorActiveInviteCount, getAmbassadorTierRates } from "@/lib/commerce/ledger";
import { ambassadorTierFor, type AmbassadorTierRateValue } from "@/lib/commerce/constants";

// One-time, super-moderator-triggered correction (explicit ask, 2026-09-15):
// applies TODAY's ambassador tier rates (DEFAULT_AMBASSADOR_TIER_RATES /
// AmbassadorTierRate) to every historical PAID order that was ALREADY
// ambassador-eligible (buyer and/or seller referredByAmbassadorId set) —
// deliberately narrow scope, it never invents new eligibility for an order
// placed before the ambassador program existed.
//
// Deliberate simplifications, both noted in the response so a moderator can
// judge them before applying:
//  - Uses each ambassador's CURRENT tier (today's active-invite count), not
//    whatever tier they were actually at when a given historical order
//    settled — reconstructing tier-over-time isn't tracked anywhere.
//  - grossKobo/commissionKobo are read from that order's own SALE_CREDIT/
//    COMMISSION_FEE ledger entries (what was actually charged at the time),
//    never recomputed with today's commission rate — only the ambassador's
//    cut of that real commission is being corrected here.
//
// Idempotent by construction: the target for each (orderId, ambassadorId)
// pair is compared against the SUM of whatever AMBASSADOR_COMMISSION
// entries already exist for that pair (original plus any prior adjustment
// from a previous run of this endpoint), and only the remaining delta is
// written — running this twice in a row is a no-op the second time. Nothing
// is ever edited or deleted; a correction is always a new, separate entry
// (money is a ledger, never a balance column).
//
// Refuses to apply (409) if any ambassador who'd be adjusted downward
// already has a PAID payout — this system has no way to pull money back
// out of a completed bank transfer, so that case needs a human decision,
// not an automatic negative balance.

const bodySchema = z.object({ apply: z.boolean().optional().default(false) });

type Adjustment = {
  orderId: string;
  ambassadorId: string;
  existingKobo: number;
  targetKobo: number;
  deltaKobo: number;
};

async function paidOrderIsFirstForUser(referredUserId: string, orderId: string, cache: Map<string, string[]>): Promise<boolean> {
  let seq = cache.get(referredUserId);
  if (!seq) {
    const [asBuyer, asSeller] = await Promise.all([
      db.order.findMany({
        where: { buyerId: referredUserId, status: "PAID" },
        select: { id: true, ledgerEntries: { where: { kind: "SALE_CREDIT" }, select: { createdAt: true }, take: 1 } },
      }),
      db.order.findMany({
        where: { status: "PAID", items: { some: { product: { creatorId: referredUserId } } } },
        select: { id: true, ledgerEntries: { where: { kind: "SALE_CREDIT" }, select: { createdAt: true }, take: 1 } },
      }),
    ]);
    const all = [...asBuyer, ...asSeller];
    all.sort((a, b) => (a.ledgerEntries[0]?.createdAt.getTime() ?? 0) - (b.ledgerEntries[0]?.createdAt.getTime() ?? 0));
    seq = all.map((o) => o.id);
    cache.set(referredUserId, seq);
  }
  return seq[0] === orderId;
}

export async function POST(req: NextRequest) {
  try {
    await requireSuperModerator(req);
    const { apply } = bodySchema.parse(await req.json().catch(() => ({})));

    const orders = await db.order.findMany({
      where: {
        status: "PAID",
        OR: [
          { buyer: { referredByAmbassadorId: { not: null } } },
          { items: { some: { product: { creator: { referredByAmbassadorId: { not: null } } } } } },
        ],
      },
      select: {
        id: true,
        buyerId: true,
        buyer: { select: { referredByAmbassadorId: true } },
        items: {
          take: 1,
          select: { product: { select: { creatorId: true, creator: { select: { referredByAmbassadorId: true } } } } },
        },
        ledgerEntries: {
          where: { kind: { in: ["SALE_CREDIT", "COMMISSION_FEE", "AMBASSADOR_COMMISSION"] } },
          select: { kind: true, amountKobo: true, userId: true },
        },
      },
    });

    const sequenceCache = new Map<string, string[]>();
    const tierRateCache = new Map<string, AmbassadorTierRateValue>();

    async function tierRatesFor(ambassadorId: string): Promise<AmbassadorTierRateValue> {
      let rates = tierRateCache.get(ambassadorId);
      if (!rates) {
        const activeInviteCount = await getAmbassadorActiveInviteCount(db, ambassadorId);
        rates = await getAmbassadorTierRates(db, ambassadorTierFor(activeInviteCount));
        tierRateCache.set(ambassadorId, rates);
      }
      return rates;
    }

    async function cutFor(ambassadorId: string, referredUserId: string, orderId: string, grossKobo: number, commissionKobo: number) {
      const [isFirst, rates] = await Promise.all([
        paidOrderIsFirstForUser(referredUserId, orderId, sequenceCache),
        tierRatesFor(ambassadorId),
      ]);
      const percent = isFirst ? rates.firstPurchasePercent : rates.continuousPercent;
      return Math.min(commissionKobo, Math.round(grossKobo * (percent / 100)));
    }

    const adjustments: Adjustment[] = [];

    for (const order of orders) {
      const saleCredit = order.ledgerEntries.find((e) => e.kind === "SALE_CREDIT");
      const commissionFee = order.ledgerEntries.find((e) => e.kind === "COMMISSION_FEE");
      if (!saleCredit || !commissionFee) continue; // shouldn't happen for a PAID order, but never guess at money
      const grossKobo = saleCredit.amountKobo;
      const commissionKobo = -commissionFee.amountKobo;

      const targets = new Map<string, number>();
      const buyerAmbassadorId = order.buyer.referredByAmbassadorId;
      if (buyerAmbassadorId) {
        const cut = await cutFor(buyerAmbassadorId, order.buyerId, order.id, grossKobo, commissionKobo);
        targets.set(buyerAmbassadorId, (targets.get(buyerAmbassadorId) ?? 0) + cut);
      }
      const seller = order.items[0]?.product;
      const sellerAmbassadorId = seller?.creator.referredByAmbassadorId;
      if (seller && sellerAmbassadorId) {
        const cut = await cutFor(sellerAmbassadorId, seller.creatorId, order.id, grossKobo, commissionKobo);
        targets.set(sellerAmbassadorId, (targets.get(sellerAmbassadorId) ?? 0) + cut);
      }

      const existingByAmbassador = new Map<string, number>();
      for (const e of order.ledgerEntries) {
        if (e.kind !== "AMBASSADOR_COMMISSION") continue;
        existingByAmbassador.set(e.userId, (existingByAmbassador.get(e.userId) ?? 0) + e.amountKobo);
      }

      const ambassadorIds = new Set([...targets.keys(), ...existingByAmbassador.keys()]);
      for (const ambassadorId of ambassadorIds) {
        const targetKobo = targets.get(ambassadorId) ?? 0;
        const existingKobo = existingByAmbassador.get(ambassadorId) ?? 0;
        const deltaKobo = targetKobo - existingKobo;
        if (deltaKobo !== 0) {
          adjustments.push({ orderId: order.id, ambassadorId, existingKobo, targetKobo, deltaKobo });
        }
      }
    }

    const totalCreditKobo = adjustments.filter((a) => a.deltaKobo > 0).reduce((sum, a) => sum + a.deltaKobo, 0);
    const totalDebitKobo = -adjustments.filter((a) => a.deltaKobo < 0).reduce((sum, a) => sum + a.deltaKobo, 0);
    const affectedAmbassadorIds = [...new Set(adjustments.map((a) => a.ambassadorId))];

    // Which affected ambassadors are being adjusted DOWNWARD (deltaKobo < 0
    // for at least one of their orders) and already have money paid out —
    // the one case this endpoint refuses to touch automatically.
    const downwardAmbassadorIds = [...new Set(adjustments.filter((a) => a.deltaKobo < 0).map((a) => a.ambassadorId))];
    const paidPayouts =
      downwardAmbassadorIds.length > 0
        ? await db.payout.findMany({
            where: { userId: { in: downwardAmbassadorIds }, status: "PAID" },
            select: { id: true, userId: true, amountKobo: true },
          })
        : [];

    if (apply && paidPayouts.length > 0) {
      return NextResponse.json(
        {
          error: "Refusing to apply: some ambassadors being adjusted downward already have a completed payout.",
          blockedByPaidPayouts: paidPayouts,
        },
        { status: 409 },
      );
    }

    if (apply && adjustments.length > 0) {
      await db.$transaction(
        adjustments.map((a) =>
          db.walletLedgerEntry.create({
            data: {
              userId: a.ambassadorId,
              orderId: a.orderId,
              amountKobo: a.deltaKobo,
              kind: "AMBASSADOR_COMMISSION",
              status: "AVAILABLE",
              availableAt: null,
            },
          }),
        ),
      );
    }

    return NextResponse.json({
      applied: apply && adjustments.length > 0,
      ordersConsidered: orders.length,
      adjustments,
      totalCreditKobo,
      totalDebitKobo,
      affectedAmbassadors: affectedAmbassadorIds.length,
      blockedByPaidPayouts: paidPayouts,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
