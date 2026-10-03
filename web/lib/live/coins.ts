// XG ("Xoldout Gifts"): a buyer-funded, one-directional prepaid balance —
// see prisma/schema.prisma's CoinLedgerEntry comment for the full reasoning
// (never cashes back out to the buyer; only the creator's resulting real
// earnings, credited via WalletLedgerEntry, are ever withdrawable).
//
// This file owns three things: the top-up pack catalog + Bachs checkout
// (mirrors lib/commerce/billboards.ts's createBillboardCheckout /
// lib/commerce/creatorPlans.ts's chargeCreatorPlanFee — same "no dedicated
// approval entity, Payment credits a ledger directly on success" shape,
// minus their wallet-first fallback, since XG can't be bought with XG);
// balance reads; and the advisory-locked debit primitive gifts/paid-access/
// paid-requests all share.

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { initializePayment } from "@/lib/bachs";

// Placeholder pricing (business decision still to be finalized — these are
// round Naira numbers loosely tracking the $0.99/$4.99/$9.99/$24.99 mockup
// tiers at no fixed FX rate, since Bachs only settles in NGN). Update freely;
// nothing else depends on these specific numbers, only on `xgAmount` being
// what's credited and `priceKobo` being what's charged.
export const XG_TOPUP_PACKS = [
  { xgAmount: 100, priceKobo: 150_000, bonusPercent: 0 }, // ₦1,500
  { xgAmount: 500, priceKobo: 700_000, bonusPercent: 0 }, // ₦7,000
  { xgAmount: 1200, priceKobo: 1_400_000, bonusPercent: 20 }, // ₦14,000 (+20% bonus already folded into xgAmount)
  { xgAmount: 3000, priceKobo: 3_500_000, bonusPercent: 20 }, // ₦35,000 (+20% bonus already folded into xgAmount)
] as const;

// Fixed creator payout rate per XG spent — deliberately independent of
// whatever pack price the buyer paid. The platform's margin is realized
// entirely at top-up time (every XG_TOPUP_PACKS price implies a higher
// per-XG cost than this), the same mental model most livestream-gifting
// platforms use, so no separate commission cut is taken on top of this at
// gift/paid-access/paid-request time. Placeholder value — tune once real
// unit economics are set.
export const XG_TO_KOBO_PAYOUT_RATE = 100; // 1 XG = ₦1.00 creator payout

export async function getCoinBalance(userId: string, client: Prisma.TransactionClient | typeof db = db): Promise<number> {
  const result = await client.coinLedgerEntry.aggregate({
    where: { userId },
    _sum: { xgAmount: true },
  });
  return result._sum.xgAmount ?? 0;
}

export class InsufficientCoinsError extends Error {}

/**
 * Shared debit primitive for gifts/paid access/paid requests — advisory-
 * locked on the spender's id, same technique as
 * lib/commerce/billboards.ts's wallet debit (there's no mutable balance row
 * to lock, so two near-simultaneous spends can't both read the same
 * pre-debit balance). Callers pass their own Prisma transaction so the debit
 * commits atomically with whatever it's paying for (a LiveGift row, a
 * LiveAccessGrant, a LiveRequest).
 */
export async function debitCoins(
  tx: Prisma.TransactionClient,
  userId: string,
  xgAmount: number,
  kind: "GIFT_DEBIT" | "PAID_ACCESS_DEBIT" | "PAID_REQUEST_DEBIT",
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

  const balance = await getCoinBalance(userId, tx);
  if (balance < xgAmount) throw new InsufficientCoinsError();

  await tx.coinLedgerEntry.create({
    data: { userId, xgAmount: -xgAmount, kind },
  });
}

/** The seller side of an XG spend — see XG_TO_KOBO_PAYOUT_RATE above. */
export async function creditCreatorFromCoins(
  tx: Prisma.TransactionClient,
  creatorId: string,
  xgAmount: number,
  kind: "LIVE_GIFT_CREDIT" | "LIVE_ACCESS_CREDIT" | "LIVE_REQUEST_CREDIT",
): Promise<void> {
  await tx.walletLedgerEntry.create({
    data: {
      userId: creatorId,
      amountKobo: xgAmount * XG_TO_KOBO_PAYOUT_RATE,
      kind,
      status: "AVAILABLE",
    },
  });
}

export class InvalidTopUpPackError extends Error {}

export async function createCoinTopUpCheckout(args: {
  userId: string;
  packIndex: number;
  origin: string;
  customerEmail: string;
  customerName: string;
}): Promise<{ checkoutUrl: string }> {
  const pack = XG_TOPUP_PACKS[args.packIndex];
  if (!pack) throw new InvalidTopUpPackError();

  const processorRef = `xg-topup-${args.userId}-${Date.now()}`;
  await db.payment.create({
    data: {
      coinTopUpUserId: args.userId,
      coinTopUpXgAmount: pack.xgAmount,
      processor: "bachs",
      processorRef,
      amountKobo: pack.priceKobo,
      status: "INITIATED",
    },
  });
  const checkoutUrl = await initializePayment({
    txRef: processorRef,
    amountKobo: pack.priceKobo,
    customerEmail: args.customerEmail,
    customerName: args.customerName,
    redirectUrl: `${args.origin}/live/coins/checkout-callback`,
    title: `XOLDOUT — ${pack.xgAmount.toLocaleString("en-NG")} XG`,
  });
  return { checkoutUrl };
}

type PaymentForCoinTopUp = { id: string; coinTopUpUserId: string | null; coinTopUpXgAmount: number | null; amountKobo: number };
type VerifiedResult = { id: number | string; status: "successful" | "failed" | string; amountKobo: number };

/**
 * Sibling of lib/commerce/billboards.ts's finalizeBillboardPayment / lib/
 * commerce/creatorPlans.ts's finalizeCreatorPlanFeePayment, for the coin-
 * top-up branch of the same Bachs webhook dispatch. A failed/amount-
 * mismatched payment just leaves the balance untouched — there's nothing to
 * roll back, same as a creator-plan charge.
 */
export async function finalizeCoinTopUpPayment(
  payment: PaymentForCoinTopUp,
  verified: VerifiedResult,
  rawPayload: unknown,
): Promise<{ alreadyProcessed: boolean }> {
  const claim = await db.payment.updateMany({
    where: { id: payment.id, status: "INITIATED" },
    data: {
      status: verified.status === "successful" ? "SUCCESSFUL" : "FAILED",
      webhookReceivedAt: new Date(),
      rawPayload: rawPayload as never,
      providerTransactionId: String(verified.id),
    },
  });
  if (claim.count === 0) return { alreadyProcessed: true };

  if (
    !payment.coinTopUpUserId ||
    !payment.coinTopUpXgAmount ||
    verified.status !== "successful" ||
    verified.amountKobo !== payment.amountKobo
  ) {
    return { alreadyProcessed: false };
  }

  await db.coinLedgerEntry.create({
    data: { userId: payment.coinTopUpUserId, xgAmount: payment.coinTopUpXgAmount, kind: "TOPUP_CREDIT" },
  });

  return { alreadyProcessed: false };
}
