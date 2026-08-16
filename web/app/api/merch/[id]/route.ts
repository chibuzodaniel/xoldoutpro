import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const patchSchema = z.object({
  description: z.string().max(2000).optional(),
  priceKobo: z.number().int().min(0).optional(),
  shippingFeeKobo: z.number().int().min(0).optional(),
  cap: z.number().int().positive().optional(),
});

async function loadOwned(id: string, userId: string) {
  const product = await db.product.findUnique({ where: { id }, include: { stockPolicy: true, merchItem: true } });
  if (!product || product.creatorId !== userId || !product.merchItem) return null;
  return product;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const product = await loadOwned(id, user.id);
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (product.status === "DELETED") return NextResponse.json({ error: "Listing is deleted" }, { status: 409 });

    if (body.cap !== undefined) {
      const policy = product.stockPolicy;
      // Same rule as releases/beats (PRD §7.2): lowering a cap is allowed
      // only down to units already sold; raising it or introducing/removing
      // a cap after publish is not, or the sell-out promise means nothing.
      if (!policy || policy.cap === null) {
        return NextResponse.json({ error: "Cannot introduce a cap on an uncapped listing" }, { status: 400 });
      }
      if (body.cap > policy.cap) {
        return NextResponse.json({ error: "Cap can only be lowered, never raised" }, { status: 400 });
      }
      if (body.cap < policy.sold) {
        return NextResponse.json({ error: `Cap cannot go below units already sold (${policy.sold})` }, { status: 400 });
      }
      await db.stockPolicy.update({
        where: { productId: id },
        data: { cap: body.cap, soldOutAt: body.cap === policy.sold ? new Date() : policy.soldOutAt },
      });
    }

    const updated = await db.product.update({
      where: { id },
      data: {
        description: body.description,
        priceKobo: body.priceKobo,
        merchItem:
          body.shippingFeeKobo !== undefined ? { update: { shippingFeeKobo: body.shippingFeeKobo } } : undefined,
      },
      include: { merchItem: true, stockPolicy: true },
    });

    return NextResponse.json({ product: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not update listing" }, { status: 500 });
  }
}

// Delete never removes what a fan bought (same rule as releases/beats) —
// this withdraws the listing from sale/discovery only. Existing orders and
// their shipping/fulfilment records are untouched.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const product = await loadOwned(id, user.id);
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.product.update({ where: { id }, data: { status: "DELETED", deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Could not delete listing" }, { status: 500 });
  }
}
