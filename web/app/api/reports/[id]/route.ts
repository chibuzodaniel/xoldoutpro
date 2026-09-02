import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { recordRefund } from "@/lib/commerce/ledger";
import { initiateRefund as initiateFlutterwaveRefund } from "@/lib/flutterwave";
import { initiateRefund as initiateMonnifyRefund } from "@/lib/monnify";
import { initiateRefund as initiateBachsRefund } from "@/lib/bachs";
import { createNotification } from "@/lib/notifications/create";

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

const patchSchema = z.object({ action: z.enum(["review", "dismiss", "takedown"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireModerator(req);
    const { id } = await params;
    const { action } = patchSchema.parse(await req.json());

    const report = await db.report.findUnique({ where: { id } });
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (report.status === "RESOLVED") return NextResponse.json({ error: "Report already resolved" }, { status: 409 });

    if (action === "review") {
      const updated = await db.report.update({ where: { id }, data: { status: "IN_REVIEW" } });
      return NextResponse.json({ report: updated });
    }

    if (action === "dismiss") {
      const updated = await db.report.update({ where: { id }, data: { status: "RESOLVED" } });
      return NextResponse.json({ report: updated });
    }

    // Takedown: PRD §14's copyright note — "a takedown path plus a way to
    // reverse the associated payout." Only meaningful for a copyright claim
    // against a Product; withdraws it from sale/discovery (same mechanism as
    // a creator's own delete) and, unlike a creator's own delete, also
    // revokes every buyer's entitlement and reverses the seller's earnings —
    // this genuinely is the refund event PRD §8 requires before an
    // entitlement may be revoked, not an arbitrary revocation.
    if (report.reason !== "COPYRIGHT_CLAIM" || report.targetType !== "PRODUCT" || !report.productId) {
      return NextResponse.json({ error: "Takedown only applies to a copyright claim on a product" }, { status: 400 });
    }

    const product = await db.product.findUniqueOrThrow({ where: { id: report.productId } });
    // Pulling infringing content down can't wait on a payment processor
    // round-trip for every buyer — this happens unconditionally, immediately.
    await db.product.update({ where: { id: product.id }, data: { status: "DELETED", deletedAt: new Date() } });

    const entitlements = await db.entitlement.findMany({
      where: { productId: product.id, revokedAt: null },
      include: { order: { include: { payment: true } } },
    });

    // A ticket/merch group buy creates multiple Entitlement rows for the same
    // Order (one per unit, see schema comment) — grouped back down to one
    // entry per order here, so a 3-ticket order refunds and notifies exactly
    // once, not three times against the same Payment.
    const entitlementsByOrder = new Map<string, typeof entitlements>();
    for (const ent of entitlements) {
      const list = entitlementsByOrder.get(ent.orderId) ?? [];
      list.push(ent);
      entitlementsByOrder.set(ent.orderId, list);
    }

    // The Flutterwave refund is a real, hard-to-reverse external effect — it
    // has to happen (and succeed) before the DB ever records a refund, or
    // the ledger can claim money moved that never actually did (the exact
    // gap this wiring closes). Each order is its own atomic step: on
    // failure it's left untouched and reported back instead of the takedown
    // silently lying about it.
    const refundFailures: { orderId: string; reason: string }[] = [];

    for (const [orderId, ents] of entitlementsByOrder) {
      const order = ents[0].order;
      const entitlementIds = ents.map((e) => e.id);

      if (order.status !== "PAID") {
        await db.entitlement.updateMany({ where: { id: { in: entitlementIds } }, data: { revokedAt: new Date() } });
        continue;
      }

      const payment = order.payment;
      if (payment && payment.amountKobo > 0) {
        if (!payment.providerTransactionId) {
          refundFailures.push({ orderId, reason: "No processor transaction on record — refund manually" });
          continue;
        }
        try {
          if (payment.processor === "monnify") {
            await initiateMonnifyRefund(payment.providerTransactionId, payment.amountKobo);
          } else if (payment.processor === "bachs") {
            await initiateBachsRefund(payment.providerTransactionId, payment.amountKobo);
          } else {
            await initiateFlutterwaveRefund(payment.providerTransactionId, payment.amountKobo);
          }
        } catch (err) {
          refundFailures.push({ orderId, reason: err instanceof Error ? err.message : "Refund call failed" });
          continue;
        }
      }

      await db.$transaction(async (tx) => {
        await tx.entitlement.updateMany({ where: { id: { in: entitlementIds } }, data: { revokedAt: new Date() } });
        if (payment) await recordRefund(tx, { sellerId: product.creatorId, orderId, grossKobo: payment.amountKobo });
        await tx.order.update({ where: { id: orderId }, data: { status: "REFUNDED" } });
      });

      if (payment) {
        await createNotification(order.buyerId, {
          kind: "REFUND",
          title: "Order refunded",
          body: `${product.title} · ${formatNaira(payment.amountKobo)} refunded to your original payment method.`,
          url: "/library",
        });
      }
    }

    await db.report.update({ where: { id }, data: { status: "RESOLVED" } });

    return NextResponse.json({ ok: true, refundFailures });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not update report" }, { status: 500 });
  }
}
