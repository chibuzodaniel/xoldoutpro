import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getWalletBalances, getCommissionRates } from "@/lib/commerce/ledger";
import { reconcilePayout } from "@/lib/commerce/reconcilePayout";
import { getXgEarningsSummary } from "@/lib/live/xgEarnings";

// PRD §1.2/§13: all currency figures live in Wallet, nowhere else. This is
// the only endpoint in the app that returns a Naira amount.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);

    // Self-healing fallback for when Bachs's payout.paid/payout.failed
    // webhook never reaches us (delivery failure, misconfigured endpoint,
    // etc.) — every load of this page double-checks any payout still
    // in-flight directly against Bachs, so a completed transfer doesn't
    // stay stuck on "Processing" forever waiting on a webhook that already
    // didn't show up. Best-effort: a Bachs hiccup here must never break the
    // wallet page, so failures are swallowed, not surfaced.
    const inFlight = await db.payout.findMany({ where: { userId: user.id, status: { in: ["PENDING", "PROCESSING"] } } });
    await Promise.allSettled(
      inFlight.map((payout) => reconcilePayout(payout).catch((err) => console.error("wallet reconcilePayout", payout.id, err))),
    );

    const { availableKobo, pendingKobo } = await getWalletBalances(user.id);

    const [earned, withdrawn, refunded, categoryBreakdown, payouts, refundsReceived, refundEntries] = await Promise.all([
      // Every kind that credits/debits a user as part of a sale itself
      // (as opposed to a withdrawal) — widened alongside the ambassador
      // and ticket-promoter features so totalEarnedKobo never diverges
      // from availableKobo, which already sums every kind unconditionally.
      db.walletLedgerEntry.aggregate({
        where: {
          userId: user.id,
          kind: {
            in: [
              "SALE_CREDIT",
              "COMMISSION_FEE",
              "AMBASSADOR_COMMISSION",
              "PROMOTER_CREDIT",
              "PROMOTER_FEE",
              "LIVE_GIFT_CREDIT",
              "LIVE_ACCESS_CREDIT",
              "LIVE_REQUEST_CREDIT",
              "XG_EARNINGS_PAYOUT",
            ],
          },
        },
        _sum: { amountKobo: true },
      }),
      db.walletLedgerEntry.aggregate({
        where: { userId: user.id, kind: "PAYOUT_DEBIT" },
        _sum: { amountKobo: true },
      }),
      // Money taken back for refunded orders (e.g. a gift nobody claimed).
      db.walletLedgerEntry.aggregate({
        where: { userId: user.id, kind: "REFUND_DEBIT" },
        _sum: { amountKobo: true },
      }),
      // findMany + manual reduce, not groupBy's _sum(priceKobo) — priceKobo
      // is a per-unit snapshot (ticket/merch group buys), so a straight sum
      // would undercount any order with quantity > 1.
      db.orderItem.findMany({
        where: { order: { status: "PAID" }, product: { creatorId: user.id } },
        select: { productId: true, priceKobo: true, quantity: true },
      }),
      db.payout.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { payoutAccount: { select: { bankName: true, accountNumber: true, accountName: true } } },
      }),
      // Refunds paid *to* this user as a buyer (REFUND_CREDIT — the
      // processor wouldn't reverse their charge, so it came to the wallet).
      db.walletLedgerEntry.aggregate({
        where: { userId: user.id, kind: "REFUND_CREDIT" },
        _sum: { amountKobo: true },
      }),
      // Refund history (explicit ask, 2026-10-15: "a history of refund and
      // the product the refund is for") — both directions: money refunded
      // into this wallet as a buyer, and sales reversed out of it as a seller.
      db.walletLedgerEntry.findMany({
        where: { userId: user.id, kind: { in: ["REFUND_CREDIT", "REFUND_DEBIT"] } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          kind: true,
          amountKobo: true,
          createdAt: true,
          order: {
            select: {
              isGift: true,
              buyer: { select: { handle: true } },
              gift: { select: { status: true } },
              items: { take: 1, select: { quantity: true, product: { select: { title: true, type: true } } } },
            },
          },
        },
      }),
    ]);

    const refundHistory = refundEntries.map((e) => {
      const item = e.order?.items[0];
      const reason =
        e.order?.gift && (e.order.gift.status === "EXPIRED" || e.order.gift.status === "REFUNDED")
          ? "Gift wasn't claimed in time"
          : e.kind === "REFUND_CREDIT"
            ? "Sold out before your payment came through"
            : "Refunded by xoldOut";
      return {
        id: e.id,
        direction: e.kind === "REFUND_CREDIT" ? ("IN" as const) : ("OUT" as const),
        amountKobo: e.amountKobo,
        createdAt: e.createdAt,
        productTitle: item?.product.title ?? "(removed product)",
        productType: item?.product.type ?? null,
        quantity: item?.quantity ?? 1,
        // Seller side only — whose purchase was reversed.
        buyerHandle: e.kind === "REFUND_DEBIT" ? (e.order?.buyer.handle ?? null) : null,
        reason,
      };
    });

    // Group gross sales by product type (PRD "earned by category") — only
    // RELEASE exists today, but Product is polymorphic so this already
    // works once Beats/Events/Merch ship without changing this query.
    const productTypes = await db.product.findMany({
      where: { id: { in: categoryBreakdown.map((c) => c.productId) } },
      select: { id: true, type: true },
    });
    const typeById = new Map(productTypes.map((p) => [p.id, p.type]));
    const byCategory: Record<string, number> = {};
    for (const row of categoryBreakdown) {
      const type = typeById.get(row.productId) ?? "RELEASE";
      byCategory[type] = (byCategory[type] ?? 0) + row.priceKobo * row.quantity;
    }

    const [commissionRates, xgEarnings] = await Promise.all([getCommissionRates(), getXgEarningsSummary(user.id)]);

    return NextResponse.json({
      availableKobo,
      pendingKobo,
      totalEarnedKobo: earned._sum.amountKobo ?? 0,
      totalWithdrawnKobo: Math.abs(withdrawn._sum.amountKobo ?? 0),
      // So the wallet adds up on screen (explicit ask, 2026-10-05, after a
      // creator saw "₦-492" with no explanation): earned − withdrawn −
      // refunded + refundsReceived − otherSpent = available + pending. otherSpent is whatever
      // remains (billboards, creator-plan fees and the like), computed as the
      // remainder so the sum always balances exactly.
      totalRefundedKobo: Math.abs(refunded._sum.amountKobo ?? 0),
      refundsReceivedKobo: refundsReceived._sum.amountKobo ?? 0,
      refundHistory,
      otherSpentKobo:
        (earned._sum.amountKobo ?? 0) +
        (refundsReceived._sum.amountKobo ?? 0) -
        Math.abs(withdrawn._sum.amountKobo ?? 0) -
        Math.abs(refunded._sum.amountKobo ?? 0) -
        (availableKobo + pendingKobo),
      earnedByCategory: byCategory,
      payouts,
      // Earned XG still being held (lib/live/xgEarnings.ts) — shown on the
      // wallet with its next payout date, never counted in availableKobo.
      xgEarnings: {
        balanceXg: xgEarnings.balanceXg,
        balanceKobo: xgEarnings.balanceKobo,
        nextPayoutAt: xgEarnings.nextPayoutAt,
        nextPayoutKobo: xgEarnings.nextPayoutKobo,
      },
      // Live, moderator-editable rates (SiteControlsPanel) — not the
      // lib/commerce/constants.ts defaults, which are just what a fresh
      // PlatformSettings row starts at. Sent as whole percent (12, not
      // 0.12) since that's what the copy below actually displays.
      commissionPercent: {
        RELEASE: Math.round(commissionRates.RELEASE * 100),
        BEAT: Math.round(commissionRates.BEAT * 100),
        MERCH: Math.round(commissionRates.MERCH * 100),
        EVENT: Math.round(commissionRates.EVENT * 100),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
