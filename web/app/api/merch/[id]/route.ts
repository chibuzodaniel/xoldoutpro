import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listingEditState, EDIT_WINDOW_HOURS } from "@/lib/editWindow";
import { MERCH_CATEGORIES } from "@/lib/discover/sectionFilters";
import { variantInputSchema, variantLabel, MAX_VARIANTS } from "@/lib/commerce/variants";
import { revalidatePath } from "next/cache";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  priceKobo: z.number().int().min(0).optional(),
  shippingFeeKobo: z.number().int().min(0).optional(),
  cap: z.number().int().positive().optional(),
  // Structure (Edit release, explicit ask 2026-11-11): editable any time.
  category: z.enum(MERCH_CATEGORIES).nullable().optional(),
  sizeGuide: z.string().trim().max(1000).nullable().optional(),
  // The full list of size/colour options; matched to existing ones by size + colour.
  variants: z.array(variantInputSchema).max(MAX_VARIANTS).optional(),
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
    // Name, description, price, shipping and stock lock after the edit
    // window; category, size guide and sizes/colours don't (2026-11-11).
    const touchesListing =
      body.title !== undefined || body.description !== undefined || body.priceKobo !== undefined || body.shippingFeeKobo !== undefined || body.cap !== undefined;
    if (touchesListing && listingEditState(product.publishedAt, product.upgradeEditAt) === "closed") {
      return NextResponse.json({ error: `Name, description and price can only be changed in the first ${EDIT_WINDOW_HOURS} hours after a listing goes live` }, { status: 403 });
    }

    if (body.variants) {
      const keyOf = (v: { size?: string | null; color?: string | null }) => `${v.size?.trim() || ""}|${v.color?.trim() || ""}`.toLowerCase();
      const wanted = body.variants.map((v, order) => ({ size: v.size?.trim() || null, color: v.color?.trim() || null, cap: v.cap ?? null, order }));
      if (new Set(wanted.map(keyOf)).size !== wanted.length) return NextResponse.json({ error: "Each size and colour combination can only be listed once" }, { status: 400 });
      const existing = await db.merchVariant.findMany({ where: { productId: id }, include: { _count: { select: { orderItems: true } } } });
      const byKey = new Map(existing.map((v) => [keyOf(v), v]));
      const wantedKeys = new Set(wanted.map(keyOf));
      // An option someone bought or has in checkout stays.
      const stuck = existing.find((v) => !wantedKeys.has(keyOf(v)) && (v._count.orderItems > 0 || v.sold > 0 || v.reserved > 0));
      if (stuck) return NextResponse.json({ error: `"${variantLabel(stuck)}" has orders, so it can't be removed. Set its stock instead.` }, { status: 400 });
      for (const w of wanted) {
        const cur = byKey.get(keyOf(w));
        if (cur && w.cap !== null && w.cap < cur.sold + cur.reserved) {
          return NextResponse.json({ error: `Stock for "${variantLabel(cur)}" can't go below ${cur.sold + cur.reserved} (already sold or in checkout)` }, { status: 400 });
        }
      }
      await db.$transaction(async (tx) => {
        await tx.merchVariant.deleteMany({ where: { productId: id, id: { in: existing.filter((v) => !wantedKeys.has(keyOf(v))).map((v) => v.id) } } });
        for (const w of wanted) {
          const cur = byKey.get(keyOf(w));
          if (cur) {
            const full = w.cap !== null && cur.sold >= w.cap;
            await tx.merchVariant.update({ where: { id: cur.id }, data: { cap: w.cap, order: w.order, soldOutAt: full ? (cur.soldOutAt ?? new Date()) : null } });
          } else {
            await tx.merchVariant.create({ data: { productId: id, size: w.size, color: w.color, cap: w.cap, order: w.order } });
          }
        }
      });
    }

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

    // Older listings' one-time upgrade edit: this save uses it (lib/editWindow.ts).
    const usesUpgrade = touchesListing && listingEditState(product.publishedAt, product.upgradeEditAt) === "upgrade";
    if (usesUpgrade) await db.product.update({ where: { id }, data: { upgradeEditAt: new Date() } });
    const updated = await db.product.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description,
        priceKobo: body.priceKobo,
        merchItem: {
          update: {
            ...(body.shippingFeeKobo !== undefined ? { shippingFeeKobo: body.shippingFeeKobo } : {}),
            ...(body.category !== undefined ? { category: body.category } : {}),
            ...(body.sizeGuide !== undefined ? { sizeGuide: body.sizeGuide || null } : {}),
          },
        },
      },
      include: { merchItem: true, stockPolicy: true },
    });

    revalidatePath(`/m/${id}`);
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
