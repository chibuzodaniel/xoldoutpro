import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
// Imported from the client-safe constants file (single source of truth —
// see that file's own comment), not defined here, so the wallet page can
// quote the same number in its own copy without duplicating it. Re-exported
// too, so every existing `from "@/lib/commerce/ledger"` import of
// COMMISSION_RATE elsewhere in the app keeps working unchanged.
import {
  COMMISSION_RATE,
  commissionRateFor,
  ambassadorTierFor,
  DEFAULT_AMBASSADOR_TIER_RATES,
  type AmbassadorTier,
  type AmbassadorTierRateValue,
} from "@/lib/commerce/constants";
export { COMMISSION_RATE, commissionRateFor };

// 7-day pending->available window, tied to the same-length refund window
// (DECISIONS.md). Only recordSale reads commissionRateFor()/COMMISSION_RATE —
// recordRefund below reverses whatever was actually charged on a given order,
// not today's rate, so past sales made under an old rate (or type) stay correct.
//
// Explicit ask, 2026-08-31, "for now": the hold itself is deactivated —
// recordSale below no longer sets a future availableAt, so a sale is
// withdrawable the moment it lands (still subject to the ₦1,000 minimum
// in lib/commerce/constants.ts). This constant, and the date-math that used
// it, are left in place rather than deleted so re-enabling the hold later
// is the one-line revert noted at that call site, not a rebuild. The
// takedown/gift-expiry reversal path (recordRefund, below) is unrelated to
// this and unchanged — that's a moderation safety mechanism, not the
// withdrawal-timing policy this toggles.
export const SETTLEMENT_WINDOW_DAYS = 7;

/**
 * Records a sale as immutable ledger entries (money is a ledger, never
 * a balance column — PRD §15): the gross credit to the seller, and the
 * platform's commission as a separate debit — plus, when applicable, a
 * ticket-promoter split (carved out of the seller's own net) and/or an
 * ambassador commission (carved out of the platform's own commission,
 * never the seller's). All settle together on the same schedule. Call
 * inside the same transaction that confirms stock and creates the
 * Entitlement, so a payment can never produce one without the others.
 */
export async function recordSale(
  tx: Prisma.TransactionClient,
  args: {
    sellerId: string;
    buyerId: string;
    orderId: string;
    grossKobo: number;
    productType: "RELEASE" | "BEAT" | "EVENT" | "MERCH";
    // Ticket promoter split (EVENT only, per-event — see EventPromoter):
    // carved out of the SELLER's own net proceeds.
    promoter?: { userId: string; sharePercent: number };
    // Ambassador program (platform-wide — see AmbassadorApplication):
    // carved out of the PLATFORM's own commission share, never the
    // seller's. An ambassador earns on EITHER side of a sale they
    // referred a party to — the buyer's own referredByAmbassadorId and/or
    // the seller's — since "invite someone who buys" and "invite someone
    // who becomes a creator and sells" both count (explicit ask). Both can
    // be set on the same order (crediting the same or different
    // ambassadors); each is evaluated independently against that specific
    // referred person's own first-transaction status.
    buyerReferredByAmbassadorId?: string | null;
    sellerReferredByAmbassadorId?: string | null;
  },
) {
  // Settlement hold deactivated for launch (see SETTLEMENT_WINDOW_DAYS's own
  // comment) — revert to
  // `new Date(Date.now() + SETTLEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000)`
  // to bring the 7-day hold back.
  const availableAt: Date | null = null;
  const status = availableAt ? "PENDING" : "AVAILABLE";
  const commissionKobo = Math.round(args.grossKobo * commissionRateFor(args.productType));
  const promoterKobo = args.promoter
    ? Math.round((args.grossKobo - commissionKobo) * (args.promoter.sharePercent / 100))
    : 0;

  const entries: Prisma.WalletLedgerEntryCreateManyInput[] = [
    { userId: args.sellerId, orderId: args.orderId, amountKobo: args.grossKobo, kind: "SALE_CREDIT", status, availableAt },
    { userId: args.sellerId, orderId: args.orderId, amountKobo: -commissionKobo, kind: "COMMISSION_FEE", status, availableAt },
  ];
  if (args.promoter && promoterKobo > 0) {
    entries.push(
      { userId: args.sellerId, orderId: args.orderId, amountKobo: -promoterKobo, kind: "PROMOTER_FEE", status, availableAt },
      { userId: args.promoter.userId, orderId: args.orderId, amountKobo: promoterKobo, kind: "PROMOTER_CREDIT", status, availableAt },
    );
  }
  await tx.walletLedgerEntry.createMany({ data: entries });

  if (args.buyerReferredByAmbassadorId) {
    await recordAmbassadorCommission(tx, {
      ambassadorId: args.buyerReferredByAmbassadorId,
      referredUserId: args.buyerId,
      orderId: args.orderId,
      commissionKobo,
    });
  }
  if (args.sellerReferredByAmbassadorId) {
    await recordAmbassadorCommission(tx, {
      ambassadorId: args.sellerReferredByAmbassadorId,
      referredUserId: args.sellerId,
      orderId: args.orderId,
      commissionKobo,
    });
  }
}

/**
 * Sums every COMMISSION_FEE the platform has ever taken on an order where
 * either the buyer or the seller was one of this ambassador's referred
 * users — i.e. how much platform revenue this ambassador has generated,
 * from either side of a sale. Purely informational (shown on the
 * ambassador's own dashboard and the moderator panel) — tier is driven by
 * getAmbassadorActiveInviteCount below, not this figure.
 */
export async function getAmbassadorRevenueGeneratedKobo(
  client: Prisma.TransactionClient | typeof db,
  ambassadorId: string,
): Promise<number> {
  const result = await client.walletLedgerEntry.aggregate({
    where: {
      kind: "COMMISSION_FEE",
      order: {
        OR: [
          { buyer: { referredByAmbassadorId: ambassadorId } },
          { items: { some: { product: { creator: { referredByAmbassadorId: ambassadorId } } } } },
        ],
      },
    },
    _sum: { amountKobo: true },
  });
  return -(result._sum.amountKobo ?? 0);
}

/**
 * How many people this ambassador referred are "active" — have completed
 * at least one PAID order, either as the buyer or as the seller (i.e. they
 * published something and it sold). A raw signup with no transaction never
 * counts. Drives ambassadorTierFor() — see that function's own comment for
 * why this replaced a revenue-based threshold.
 */
export async function getAmbassadorActiveInviteCount(
  client: Prisma.TransactionClient | typeof db,
  ambassadorId: string,
): Promise<number> {
  return client.user.count({
    where: {
      referredByAmbassadorId: ambassadorId,
      OR: [
        { orders: { some: { status: "PAID" } } },
        { products: { some: { orderItems: { some: { order: { status: "PAID" } } } } } },
      ],
    },
  });
}

/** Moderator-configurable, lazily-defaulted first-purchase/continuous rates for a given tier. */
export async function getAmbassadorTierRates(
  client: Prisma.TransactionClient | typeof db,
  tier: AmbassadorTier,
): Promise<AmbassadorTierRateValue> {
  const row = await client.ambassadorTierRate.findUnique({ where: { tier } });
  return row
    ? { firstPurchasePercent: row.firstPurchasePercent, continuousPercent: row.continuousPercent }
    : DEFAULT_AMBASSADOR_TIER_RATES[tier];
}

/**
 * Whether this PAID order is the very first transaction `userId` has ever
 * been party to — as a buyer OR as a seller (an item in the order belongs
 * to them). Order status is already flipped to PAID in the same
 * transaction before recordSale runs, so "this order is the only one" (a
 * count of 1) means it's their first. Drives which of a tier's two rates
 * (first-purchase vs. continuous) an ambassador earns for this specific
 * referred person — tracked once per person across BOTH buying and
 * selling, not separately per role.
 */
async function isFirstQualifyingTransaction(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const [priorAsBuyer, priorAsSeller] = await Promise.all([
    tx.order.count({ where: { buyerId: userId, status: "PAID" } }),
    tx.order.count({ where: { status: "PAID", items: { some: { product: { creatorId: userId } } } } }),
  ]);
  return priorAsBuyer + priorAsSeller <= 1;
}

/**
 * Automatic, per-sale credit to an ambassador when `referredUserId` (either
 * this order's buyer or its seller) is one of their referrals — carved out
 * of the platform's own commission on THIS sale, never the seller's net.
 * Pays the tier's firstPurchasePercent on referredUserId's first-ever
 * transaction (buying or selling, tracked as one combined "have they ever
 * transacted" state) and continuousPercent on every one after that. Tier
 * itself comes from the ambassador's active-invite count. No-ops (and
 * touches nothing) if the computed cut rounds to zero.
 */
async function recordAmbassadorCommission(
  tx: Prisma.TransactionClient,
  args: { ambassadorId: string; referredUserId: string; orderId: string; commissionKobo: number },
) {
  const [isFirst, activeInviteCount] = await Promise.all([
    isFirstQualifyingTransaction(tx, args.referredUserId),
    getAmbassadorActiveInviteCount(tx, args.ambassadorId),
  ]);
  const tier = ambassadorTierFor(activeInviteCount);
  const rates = await getAmbassadorTierRates(tx, tier);
  const percent = isFirst ? rates.firstPurchasePercent : rates.continuousPercent;
  const ambassadorKobo = Math.round(args.commissionKobo * (percent / 100));
  if (ambassadorKobo <= 0) return;

  await tx.walletLedgerEntry.create({
    data: {
      userId: args.ambassadorId,
      orderId: args.orderId,
      amountKobo: ambassadorKobo,
      kind: "AMBASSADOR_COMMISSION",
      status: "AVAILABLE",
      availableAt: null,
    },
  });
}

/**
 * Reverses a previously recorded sale: an immutable debit for the net
 * amount the seller actually received (gross minus commission minus any
 * promoter cut), so every entry recordSale created for this order nets to
 * zero regardless of whether it's settled yet — plus symmetric clawbacks
 * from a promoter and/or ambassador if this sale credited either of them.
 * Takes effect immediately (availableAt: null) rather than after the usual
 * settlement window — a seller (or promoter, or ambassador) holding funds
 * from a reversed sale owes them back now, not in 7 days. Used by the
 * copyright takedown path (PRD §14): "a takedown path plus a way to
 * reverse the associated payout."
 *
 * Reverses whatever was *actually* charged/credited on this specific
 * order — looked up from the entries recordSale created for it — rather
 * than recomputing from today's rates. Rates (commission %, an event's
 * promoter %, an ambassador's tier %) can all change between when a sale
 * settles and when it's later refunded or taken down; recomputing from
 * whatever they happen to be *now* would silently over- or under-reverse a
 * sale made under different rates. Both call sites only invoke this when
 * `payment` exists on the order, and recordSale (which always creates the
 * COMMISSION_FEE entry alongside SALE_CREDIT, in the same transaction) is
 * the only path that ever produces a paid order — so that entry existing
 * isn't optional to handle, it's guaranteed. PROMOTER_FEE/AMBASSADOR_
 * COMMISSION are optional, since not every sale has either.
 */
export async function recordRefund(
  tx: Prisma.TransactionClient,
  args: { sellerId: string; orderId: string; grossKobo: number },
) {
  const [commissionEntry, promoterFeeEntry, ambassadorEntries] = await Promise.all([
    tx.walletLedgerEntry.findFirstOrThrow({ where: { orderId: args.orderId, kind: "COMMISSION_FEE" } }),
    tx.walletLedgerEntry.findFirst({ where: { orderId: args.orderId, kind: "PROMOTER_FEE" } }),
    // Up to two — a sale can credit an ambassador on the buyer's side, the
    // seller's side, or both (recordSale above), each its own row.
    tx.walletLedgerEntry.findMany({ where: { orderId: args.orderId, kind: "AMBASSADOR_COMMISSION" } }),
  ]);
  const commissionKobo = -commissionEntry.amountKobo;
  const promoterKobo = promoterFeeEntry ? -promoterFeeEntry.amountKobo : 0;
  const netKobo = args.grossKobo - commissionKobo - promoterKobo;

  const entries: Prisma.WalletLedgerEntryCreateManyInput[] = [
    { userId: args.sellerId, orderId: args.orderId, amountKobo: -netKobo, kind: "REFUND_DEBIT", status: "AVAILABLE", availableAt: null },
  ];

  if (promoterFeeEntry && promoterKobo > 0) {
    const promoterCreditEntry = await tx.walletLedgerEntry.findFirstOrThrow({
      where: { orderId: args.orderId, kind: "PROMOTER_CREDIT" },
    });
    entries.push({
      userId: promoterCreditEntry.userId,
      orderId: args.orderId,
      amountKobo: -promoterKobo,
      kind: "REFUND_DEBIT",
      status: "AVAILABLE",
      availableAt: null,
    });
  }

  for (const ambassadorEntry of ambassadorEntries) {
    entries.push({
      userId: ambassadorEntry.userId,
      orderId: args.orderId,
      amountKobo: -ambassadorEntry.amountKobo,
      kind: "REFUND_DEBIT",
      status: "AVAILABLE",
      availableAt: null,
    });
  }

  await tx.walletLedgerEntry.createMany({ data: entries });
}

// Available/pending are computed from `availableAt` at query time rather
// than trusted from the stored `status` column, so a balance is always
// correct the instant the settlement window elapses — no dependency on a
// sweep job having run recently. Entries with no availableAt (payout debits,
// which take effect immediately) count as available right away.
//
// Accepts an optional transaction client so a caller that needs to check
// the balance and then write a debit atomically (withdraw route) can run
// both inside the same `db.$transaction` — see that route for why this
// matters (a plain sequential check-then-write has a race window two
// near-simultaneous withdrawals could both slip through).
export async function getWalletBalances(userId: string, client: Prisma.TransactionClient | typeof db = db) {
  const now = new Date();
  const [available, pending] = await Promise.all([
    client.walletLedgerEntry.aggregate({
      where: { userId, OR: [{ availableAt: null }, { availableAt: { lte: now } }] },
      _sum: { amountKobo: true },
    }),
    client.walletLedgerEntry.aggregate({
      where: { userId, availableAt: { gt: now } },
      _sum: { amountKobo: true },
    }),
  ]);
  return {
    availableKobo: available._sum.amountKobo ?? 0,
    pendingKobo: pending._sum.amountKobo ?? 0,
  };
}
