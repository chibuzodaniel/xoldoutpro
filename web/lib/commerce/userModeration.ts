import type { LedgerKind } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getWalletBalances, getCommissionRates } from "@/lib/commerce/ledger";
import { getCreatorPlanSettings } from "@/lib/commerce/creatorPlans";

// Human labels for the moderator-facing activity feed — same enum
// AmbassadorsPanel/EventCommissionRecompute already surface individual
// kinds of, just named for a mixed timeline instead of a single-kind list.
const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  SALE_CREDIT: "Sale",
  COMMISSION_FEE: "Platform commission",
  REFUND_DEBIT: "Refund",
  PAYOUT_DEBIT: "Payout",
  AMBASSADOR_COMMISSION: "Ambassador commission",
  PROMOTER_CREDIT: "Ticket promoter credit",
  PROMOTER_FEE: "Ticket promoter fee",
  BILLBOARD_FEE: "Billboard purchase",
  BILLBOARD_REFUND: "Billboard refund",
  CREATOR_PLAN_FEE: "Creator plan charge",
};

/**
 * One user's full moderator-facing view (explicit ask, 2026-09-22: "click on
 * any user profile ... manage the users income to view all products the
 * user has uploaded, how much the user has made, all activities on the
 * platform"). View-only by explicit decision — no write path here, money
 * corrections still only ever go through the dedicated recompute tools.
 * requireModerator, not requireSuperModerator: same bar UsersListPanel and
 * ProductsPanel's per-order amounts already sit behind — a regular
 * moderator seeing what a user earned is normal support/lookup work here,
 * same reasoning UsersListPanel gives for showing email.
 *
 * Wallet totals mirror GET /api/wallet's own queries exactly (getWalletBalances
 * + the same earned/withdrawn/category aggregates), just parameterized by an
 * arbitrary userId instead of the authenticated caller.
 */
export async function getUserModerationDetail(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      handle: true,
      displayName: true,
      email: true,
      bio: true,
      createdAt: true,
      deletedAt: true,
      isModerator: true,
      isSuperModerator: true,
      isVerified: true,
      creatorPlan: true,
    },
  });
  if (!user) return null;

  const [{ availableKobo, pendingKobo }, earned, withdrawn, categoryRows, payouts, products, ledgerEntries, purchases, rates, creatorPlanSettings] =
    await Promise.all([
      getWalletBalances(userId),
      db.walletLedgerEntry.aggregate({
        where: { userId, kind: { in: ["SALE_CREDIT", "COMMISSION_FEE", "AMBASSADOR_COMMISSION", "PROMOTER_CREDIT", "PROMOTER_FEE"] } },
        _sum: { amountKobo: true },
      }),
      db.walletLedgerEntry.aggregate({
        where: { userId, kind: "PAYOUT_DEBIT" },
        _sum: { amountKobo: true },
      }),
      // Same undercount-avoidance reasoning as /api/wallet: priceKobo is a
      // per-unit snapshot, so a straight sum would miss quantity > 1.
      db.orderItem.findMany({
        where: { order: { status: "PAID" }, product: { creatorId: userId } },
        select: { productId: true, priceKobo: true, quantity: true },
      }),
      db.payout.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { payoutAccount: { select: { bankName: true, accountNumber: true, accountName: true } } },
      }),
      db.product.findMany({
        where: { creatorId: userId },
        orderBy: { createdAt: "desc" },
        include: { stockPolicy: { select: { sold: true, cap: true } } },
      }),
      db.walletLedgerEntry.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, amountKobo: true, kind: true, status: true, orderId: true, createdAt: true },
      }),
      // What they've bought as a customer — distinct from the ledger above,
      // which only ever reflects money moving through THEIR OWN wallet.
      db.order.findMany({
        where: { buyerId: userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          status: true,
          createdAt: true,
          items: { take: 1, select: { product: { select: { title: true, type: true } } } },
          payment: { select: { amountKobo: true } },
        },
      }),
      getCommissionRates(),
      getCreatorPlanSettings(),
    ]);

  const typeById = new Map(products.map((p) => [p.id, p.type]));
  const earnedByCategory: Record<string, number> = {};
  for (const row of categoryRows) {
    const type = typeById.get(row.productId) ?? "RELEASE";
    earnedByCategory[type] = (earnedByCategory[type] ?? 0) + row.priceKobo * row.quantity;
  }

  // Same per-plan branching as app/api/admin/products/route.ts's
  // commissionPercentFor, batched over rates/settings fetched once above
  // rather than re-reading PlatformSettings per product.
  function commissionPercentFor(type: (typeof products)[number]["type"]) {
    if (user!.creatorPlan === "LIMITED") return 0;
    if (user!.creatorPlan === "BUYER_PAYS_FEE") {
      return type === "EVENT" ? creatorPlanSettings.buyerPaysFeeEventPercent : creatorPlanSettings.buyerPaysFeePercent;
    }
    return Math.round(rates[type] * 100);
  }

  return {
    user,
    wallet: {
      availableKobo,
      pendingKobo,
      totalEarnedKobo: earned._sum.amountKobo ?? 0,
      totalWithdrawnKobo: Math.abs(withdrawn._sum.amountKobo ?? 0),
      earnedByCategory,
    },
    products: products.map((p) => ({
      id: p.id,
      type: p.type,
      title: p.title,
      priceKobo: p.priceKobo,
      status: p.status,
      createdAt: p.createdAt,
      sold: p.stockPolicy?.sold ?? 0,
      cap: p.stockPolicy?.cap ?? null,
      commissionPercent: commissionPercentFor(p.type),
    })),
    purchases: purchases.map((o) => ({
      orderId: o.id,
      productTitle: o.items[0]?.product.title ?? "(deleted product)",
      productType: o.items[0]?.product.type ?? null,
      amountKobo: o.payment?.amountKobo ?? 0,
      status: o.status,
      createdAt: o.createdAt,
    })),
    activity: ledgerEntries.map((e) => ({
      id: e.id,
      label: LEDGER_KIND_LABEL[e.kind],
      amountKobo: e.amountKobo,
      status: e.status,
      orderId: e.orderId,
      createdAt: e.createdAt,
    })),
    payouts,
  };
}
