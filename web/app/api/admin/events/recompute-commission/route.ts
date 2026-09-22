import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getCommissionRates } from "@/lib/commerce/ledger";
import { getCreatorPlanSettings } from "@/lib/commerce/creatorPlans";

// One-time, super-moderator-triggered correction (explicit ask, 2026-09-22:
// "to correct it [on] already sold events") — applies TODAY's event
// commission rate(s) to every historical PAID Event order, same shape as
// /api/admin/ambassadors/recompute-legacy (preview/apply split, idempotent
// delta entries, refuses to claw back a paid payout).
//
// Per-plan handling (confirmed with the user — "all plans, best-effort"):
//  - UNLIMITED (or a null plan, same fallback computeCreatorPlanCheckout
//    uses): target = round(grossKobo * commissionEventPercent). The buyer's
//    payment is never touched here — this only ever reallocates the split
//    between seller and platform, so it's exactly right, not an
//    approximation.
//  - BUYER_PAYS_FEE: the buyer's original payment already baked in the OLD
//    buyerPaysFeeEventPercent as an added service charge — there is no way
//    to retroactively change what they were charged without a real refund/
//    re-charge, which this endpoint never does. Best effort instead: the
//    base price is reconstructed (grossKobo - existing commission, since
//    the original commission *was* exactly the old service charge) and the
//    CURRENT rate is applied against that reconstructed base, not against
//    grossKobo directly (which would double-count the old service charge).
//    The seller's net after this may not land on exactly 100% of their
//    listed price for orders placed before the rate changed — an accepted,
//    explicit tradeoff, not a bug.
//  - LIMITED: commission is always 0, nothing to correct.
//
// Deliberately out of scope: ticket-promoter splits (EventPromoter,
// PROMOTER_FEE/PROMOTER_CREDIT) are computed from the seller's net after
// commission but are NOT recomputed here — this only touches the platform's
// own commission cut, same narrow scope as the ambassador tool touching
// only the ambassador's cut.
//
// Idempotent by construction: existingCommissionKobo is the SUM of every
// COMMISSION_FEE entry already on the order (original plus any prior
// correction from a previous run), so only the remaining delta is written —
// running this twice in a row is a no-op the second time.

const bodySchema = z.object({ apply: z.boolean().optional().default(false) });

type Adjustment = {
  orderId: string;
  sellerId: string;
  existingCommissionKobo: number;
  targetCommissionKobo: number;
  deltaKobo: number;
};

export async function POST(req: NextRequest) {
  try {
    await requireSuperModerator(req);
    const { apply } = bodySchema.parse(await req.json().catch(() => ({})));

    const [rates, planSettings, orders] = await Promise.all([
      getCommissionRates(),
      getCreatorPlanSettings(),
      db.order.findMany({
        where: { status: "PAID", items: { some: { product: { type: "EVENT" } } } },
        select: {
          id: true,
          items: {
            take: 1,
            select: { product: { select: { creatorId: true, creator: { select: { creatorPlan: true } } } } },
          },
          ledgerEntries: {
            where: { kind: { in: ["SALE_CREDIT", "COMMISSION_FEE"] } },
            select: { kind: true, amountKobo: true },
          },
        },
      }),
    ]);

    const adjustments: Adjustment[] = [];

    for (const order of orders) {
      const seller = order.items[0]?.product;
      if (!seller) continue;

      const saleCredit = order.ledgerEntries.find((e) => e.kind === "SALE_CREDIT");
      const commissionFeeEntries = order.ledgerEntries.filter((e) => e.kind === "COMMISSION_FEE");
      if (!saleCredit || commissionFeeEntries.length === 0) continue; // shouldn't happen for a PAID order, but never guess at money

      const grossKobo = saleCredit.amountKobo;
      const existingCommissionKobo = -commissionFeeEntries.reduce((sum, e) => sum + e.amountKobo, 0);

      let targetCommissionKobo: number;
      if (seller.creator.creatorPlan === "LIMITED") {
        targetCommissionKobo = 0;
      } else if (seller.creator.creatorPlan === "BUYER_PAYS_FEE") {
        const basePriceKobo = grossKobo - existingCommissionKobo;
        targetCommissionKobo = Math.round((basePriceKobo * planSettings.buyerPaysFeeEventPercent) / 100);
      } else {
        targetCommissionKobo = Math.round(grossKobo * rates.EVENT);
      }

      const deltaKobo = targetCommissionKobo - existingCommissionKobo;
      if (deltaKobo !== 0) {
        adjustments.push({ orderId: order.id, sellerId: seller.creatorId, existingCommissionKobo, targetCommissionKobo, deltaKobo });
      }
    }

    const totalCreditKobo = -adjustments.filter((a) => a.deltaKobo < 0).reduce((sum, a) => sum + a.deltaKobo, 0);
    const totalDebitKobo = adjustments.filter((a) => a.deltaKobo > 0).reduce((sum, a) => sum + a.deltaKobo, 0);
    const affectedSellerIds = [...new Set(adjustments.map((a) => a.sellerId))];

    // A positive delta means MORE commission is taken, i.e. the seller's net
    // goes DOWN — the one case this endpoint refuses to apply automatically
    // if that seller already has a completed payout (no way to pull money
    // back out of a finished bank transfer).
    const downwardSellerIds = [...new Set(adjustments.filter((a) => a.deltaKobo > 0).map((a) => a.sellerId))];
    const paidPayouts =
      downwardSellerIds.length > 0
        ? await db.payout.findMany({
            where: { userId: { in: downwardSellerIds }, status: "PAID" },
            select: { id: true, userId: true, amountKobo: true },
          })
        : [];

    if (apply && paidPayouts.length > 0) {
      return NextResponse.json(
        {
          error: "Refusing to apply: some sellers being adjusted downward already have a completed payout.",
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
              userId: a.sellerId,
              orderId: a.orderId,
              amountKobo: -a.deltaKobo,
              kind: "COMMISSION_FEE",
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
      affectedSellers: affectedSellerIds.length,
      blockedByPaidPayouts: paidPayouts,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
