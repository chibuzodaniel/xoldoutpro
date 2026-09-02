import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
// Imported from the client-safe constants file (single source of truth —
// see that file's own comment), not defined here, so the wallet page can
// quote the same number in its own copy without duplicating it. Re-exported
// too, so every existing `from "@/lib/commerce/ledger"` import of
// COMMISSION_RATE elsewhere in the app keeps working unchanged.
import { COMMISSION_RATE, commissionRateFor } from "@/lib/commerce/constants";
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
 * Records a sale as two immutable ledger entries (money is a ledger, never
 * a balance column — PRD §15): the gross credit to the seller, and the
 * platform's commission as a separate debit. Both settle together on the
 * same schedule. Call inside the same transaction that confirms stock and
 * creates the Entitlement, so a payment can never produce one without the other.
 */
export async function recordSale(
  tx: Prisma.TransactionClient,
  args: { sellerId: string; orderId: string; grossKobo: number; productType: "RELEASE" | "BEAT" | "EVENT" | "MERCH" },
) {
  // Settlement hold deactivated for launch (see SETTLEMENT_WINDOW_DAYS's own
  // comment) — revert to
  // `new Date(Date.now() + SETTLEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000)`
  // to bring the 7-day hold back.
  const availableAt: Date | null = null;
  const commissionKobo = Math.round(args.grossKobo * commissionRateFor(args.productType));

  await tx.walletLedgerEntry.createMany({
    data: [
      {
        userId: args.sellerId,
        orderId: args.orderId,
        amountKobo: args.grossKobo,
        kind: "SALE_CREDIT",
        status: availableAt ? "PENDING" : "AVAILABLE",
        availableAt,
      },
      {
        userId: args.sellerId,
        orderId: args.orderId,
        amountKobo: -commissionKobo,
        kind: "COMMISSION_FEE",
        status: availableAt ? "PENDING" : "AVAILABLE",
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
