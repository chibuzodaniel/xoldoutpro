import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// DECISIONS.md: 12% commission (was 15% at launch, updated 2026-08-31), fee
// absorbed by the platform (not passed to the artist as a separate
// withdrawal fee), 7-day pending->available window tied to the
// same-length refund window. Only recordSale reads this — recordRefund
// below reverses whatever was actually charged on a given order, not this
// current value, so past sales made under the old rate stay correct.
export const COMMISSION_RATE = 0.12;
export const SETTLEMENT_WINDOW_DAYS = 7;

/**
 * Records a sale as two immutable ledger entries (money is a ledger, never
 * a balance column — PRD §15): the gross credit to the seller, and the
 * platform's commission as a separate debit. Both settle together on the
 * same schedule. Call inside the same transaction that confirms stock and
 * creates the Entitlement, so a payment can never produce one without the other.
 */
export async function recordSale(
  tx: Prisma.TransactionClient,
  args: { sellerId: string; orderId: string; grossKobo: number },
) {
  const availableAt = new Date(Date.now() + SETTLEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const commissionKobo = Math.round(args.grossKobo * COMMISSION_RATE);

  await tx.walletLedgerEntry.createMany({
    data: [
      {
        userId: args.sellerId,
        orderId: args.orderId,
        amountKobo: args.grossKobo,
        kind: "SALE_CREDIT",
        status: "PENDING",
        availableAt,
      },
      {
        userId: args.sellerId,
        orderId: args.orderId,
        amountKobo: -commissionKobo,
        kind: "COMMISSION_FEE",
        status: "PENDING",
        availableAt,
      },
    ],
  });
}

/**
 * Reverses a previously recorded sale: a single immutable debit for the net
 * amount the seller received (gross minus commission), so the two entries
 * from recordSale net to zero regardless of whether they've settled yet.
 * Takes effect immediately (availableAt: null) rather than after the usual
 * settlement window — a seller holding funds from a reversed sale owes them
 * back now, not in 7 days. Used by the copyright takedown path (PRD §14):
 * "a takedown path plus a way to reverse the associated payout."
 *
 * Reverses whatever commission was *actually* charged on this specific
 * order — looked up from the COMMISSION_FEE entry recordSale created for
 * it — rather than recomputing from the current COMMISSION_RATE. The rate
 * can change between when a sale settles and when it's later refunded or
 * taken down; recomputing from whatever the rate happens to be *now* would
 * silently over- or under-reverse a sale made under a different rate. Both
 * call sites only invoke this when `payment` exists on the order, and
 * recordSale (which always creates this entry alongside SALE_CREDIT, in
 * the same transaction) is the only path that ever produces a paid order —
 * so this entry existing isn't optional to handle, it's guaranteed.
 */
export async function recordRefund(
  tx: Prisma.TransactionClient,
  args: { sellerId: string; orderId: string; grossKobo: number },
) {
  const commissionEntry = await tx.walletLedgerEntry.findFirstOrThrow({
    where: { orderId: args.orderId, kind: "COMMISSION_FEE" },
  });
  const commissionKobo = -commissionEntry.amountKobo;
  const netKobo = args.grossKobo - commissionKobo;

  await tx.walletLedgerEntry.create({
    data: {
      userId: args.sellerId,
      orderId: args.orderId,
      amountKobo: -netKobo,
      kind: "REFUND_DEBIT",
      status: "AVAILABLE",
      availableAt: null,
    },
  });
}

// Available/pending are computed from `availableAt` at query time rather
// than trusted from the stored `status` column, so a balance is always
// correct the instant the settlement window elapses — no dependency on a
// sweep job having run recently. Entries with no availableAt (payout debits,
// which take effect immediately) count as available right away.
export async function getWalletBalances(userId: string) {
  const now = new Date();
  const [available, pending] = await Promise.all([
    db.walletLedgerEntry.aggregate({
      where: { userId, OR: [{ availableAt: null }, { availableAt: { lte: now } }] },
      _sum: { amountKobo: true },
    }),
    db.walletLedgerEntry.aggregate({
      where: { userId, availableAt: { gt: now } },
      _sum: { amountKobo: true },
    }),
  ]);
  return {
    availableKobo: available._sum.amountKobo ?? 0,
    pendingKobo: pending._sum.amountKobo ?? 0,
  };
}
