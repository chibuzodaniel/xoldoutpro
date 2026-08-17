import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { recordRefund } from "@/lib/commerce/ledger";

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

    await db.$transaction(async (tx) => {
      const product = await tx.product.findUniqueOrThrow({ where: { id: report.productId! } });
      await tx.product.update({ where: { id: product.id }, data: { status: "DELETED", deletedAt: new Date() } });

      const entitlements = await tx.entitlement.findMany({
        where: { productId: product.id, revokedAt: null },
        include: { order: { include: { payment: true } } },
      });

      for (const ent of entitlements) {
        await tx.entitlement.update({ where: { id: ent.id }, data: { revokedAt: new Date() } });
        if (ent.order.status !== "PAID") continue;
        if (ent.order.payment) {
          await recordRefund(tx, { sellerId: product.creatorId, orderId: ent.orderId, grossKobo: ent.order.payment.amountKobo });
        }
        await tx.order.update({ where: { id: ent.orderId }, data: { status: "REFUNDED" } });
      }

      await tx.report.update({ where: { id }, data: { status: "RESOLVED" } });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not update report" }, { status: 500 });
  }
}
