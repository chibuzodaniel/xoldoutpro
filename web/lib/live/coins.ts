// XG ("Xoldout Gifts"): a buyer-funded, one-directional prepaid balance —
// see prisma/schema.prisma's CoinLedgerEntry comment for the full reasoning
// (never cashes back out to the buyer; only the creator's resulting
// earned XG — lib/live/xgEarnings.ts, converted to Naira monthly — is ever
// withdrawable).
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
import { getWalletBalances } from "@/lib/commerce/ledger";

// XG pricing (explicit asks, 2026-10-04): buying starts at ₦500 and ₦1,000,
// and every pack carries a small bonus that rounds it to a clean XG amount,
// bigger packs a little better per XG — the same shape as TikTok coin packs.
// Bonuses are measured against a ₦15/XG base and kept modest: even the best
// pack (₦12.96/XG) sells XG at more than double the ₦6 creator payout
// (PlatformSettings.xgPayoutRateKobo), so every gift stays well in margin.
// A checkout snapshots its XG amount onto the Payment row at creation, so
// changing this list never changes what an in-flight purchase credits.
export const XG_TOPUP_PACKS = [
  { xgAmount: 35, priceKobo: 50_000, bonusPercent: 5 }, // ₦500    → ₦14.29/XG
  { xgAmount: 70, priceKobo: 100_000, bonusPercent: 5 }, // ₦1,000  → ₦14.29/XG
  { xgAmount: 105, priceKobo: 150_000, bonusPercent: 5 }, // ₦1,500  → ₦14.29/XG
  { xgAmount: 500, priceKobo: 700_000, bonusPercent: 7 }, // ₦7,000  → ₦14.00/XG
  { xgAmount: 1050, priceKobo: 1_400_000, bonusPercent: 13 }, // ₦14,000 → ₦13.33/XG
  { xgAmount: 2700, priceKobo: 3_500_000, bonusPercent: 16 }, // ₦35,000 → ₦12.96/XG
] as const;

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
  kind: "GIFT_DEBIT" | "PAID_ACCESS_DEBIT" | "PAID_REQUEST_DEBIT" | "BATTLE_PRIZE_HOLD",
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

  const balance = await getCoinBalance(userId, tx);
  if (balance < xgAmount) throw new InsufficientCoinsError();

  await tx.coinLedgerEntry.create({
    data: { userId, xgAmount: -xgAmount, kind },
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

export class InsufficientWalletError extends Error {}

/**
 * Buy an XG pack with wallet money instead of a Bachs checkout (explicit
 * ask, 2026-10-08: "users can buy XG using their wallet balance"). One
 * transaction: lock on the user (the same advisory lock withdrawals,
 * billboards and creator-plan charges take, so none of them can spend the
 * same Naira twice), check the available balance, debit the wallet
 * (XG_PURCHASE) and credit the XG (TOPUP_CREDIT).
 */
export async function buyXgWithWallet(userId: string, packIndex: number): Promise<{ xgAmount: number; priceKobo: number }> {
  const pack = XG_TOPUP_PACKS[packIndex];
  if (!pack) throw new InvalidTopUpPackError();
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const { availableKobo } = await getWalletBalances(userId, tx);
    if (availableKobo < pack.priceKobo) throw new InsufficientWalletError();
    await tx.walletLedgerEntry.create({
      data: { userId, amountKobo: -pack.priceKobo, kind: "XG_PURCHASE", status: "AVAILABLE" },
    });
    await tx.coinLedgerEntry.create({ data: { userId, xgAmount: pack.xgAmount, kind: "TOPUP_CREDIT" } });
  });
  return { xgAmount: pack.xgAmount, priceKobo: pack.priceKobo };
}
