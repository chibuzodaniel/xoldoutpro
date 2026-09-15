import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getWalletBalances, getCommissionRates } from "@/lib/commerce/ledger";
import { reconcilePayout } from "@/lib/commerce/reconcilePayout";

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

    const [earned, withdrawn, categoryBreakdown, payouts] = await Promise.all([
      // Every kind that credits/debits a user as part of a sale itself
      // (as opposed to a withdrawal) — widened alongside the ambassador
      // and ticket-promoter features so totalEarnedKobo never diverges
      // from availableKobo, which already sums every kind unconditionally.
      db.walletLedgerEntry.aggregate({
        where: {
          userId: user.id,
          kind: { in: ["SALE_CREDIT", "COMMISSION_FEE", "AMBASSADOR_COMMISSION", "PROMOTER_CREDIT", "PROMOTER_FEE"] },
        },
        _sum: { amountKobo: true },
      }),
      db.walletLedgerEntry.aggregate({
        where: { userId: user.id, kind: "PAYOUT_DEBIT" },
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
    ]);

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

    const commissionRates = await getCommissionRates();

    return NextResponse.json({
      availableKobo,
      pendingKobo,
      totalEarnedKobo: earned._sum.amountKobo ?? 0,
      totalWithdrawnKobo: Math.abs(withdrawn._sum.amountKobo ?? 0),
      earnedByCategory: byCategory,
      payouts,
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
