import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getProductModerationDetail } from "@/lib/commerce/productModeration";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireModerator(req);
    const { id } = await params;
    const detail = await getProductModerationDetail(id);
    if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Union of every product type's own creator-facing PATCH fields
// (app/api/{releases,beats,merch,events}/[id]/route.ts) — which ones
// actually apply is decided per product.type below. Deliberately NOT the
// ticket-tier's own name/price/cap: those stay frozen even for a moderator
// (app/api/events/[id]/tiers/[tierId]/route.ts has no PATCH at all — "a
// buyer's receipt should always match what they saw" is a receipt-integrity
// invariant, not the 48h/cap-only-lowers policy limit the user asked
// moderators to be able to override). An EVENT product's title/description
// here mean the parent Event's, not the tier's.
const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  priceKobo: z.number().int().min(0).optional(),
  cap: z.number().int().positive().optional(),
  shippingFeeKobo: z.number().int().min(0).optional(),
  venue: z.string().max(200).optional(),
  coverImageLadder: z.record(z.string(), z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireModerator(req);
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const product = await db.product.findUnique({
      where: { id },
      include: { stockPolicy: true, ticketTier: true },
    });
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (product.status === "DELETED") return NextResponse.json({ error: "Product is deleted" }, { status: 409 });

    // No isWithinEditWindow check here (explicit ask: moderators override
    // the creator-facing 48h window) — but the cap floor is a data-integrity
    // rule, not a policy speed bump, so it's enforced regardless of who's
    // editing: never below units already sold. Unlike the creator route,
    // raising the cap (or introducing one on a previously uncapped product)
    // IS allowed here.
    if (body.cap !== undefined && product.type !== "EVENT") {
      const policy = product.stockPolicy;
      if (policy && body.cap < policy.sold) {
        return NextResponse.json({ error: `Cap cannot go below units already sold (${policy.sold})` }, { status: 400 });
      }
      await db.stockPolicy.upsert({
        where: { productId: id },
        create: { productId: id, cap: body.cap },
        update: { cap: body.cap, soldOutAt: policy && body.cap === policy.sold ? new Date() : (policy?.soldOutAt ?? null) },
      });
    }

    if (product.type === "EVENT") {
      if (!product.ticketTier) return NextResponse.json({ error: "Malformed event product" }, { status: 500 });
      await db.event.update({
        where: { id: product.ticketTier.eventId },
        data: { title: body.title, description: body.description, venue: body.venue, coverImageLadder: body.coverImageLadder },
      });
    } else {
      await db.product.update({
        where: { id },
        data: {
          title: body.title,
          description: body.description,
          priceKobo: body.priceKobo,
          merchItem:
            product.type === "MERCH" && body.shippingFeeKobo !== undefined
              ? { update: { shippingFeeKobo: body.shippingFeeKobo } }
              : undefined,
        },
      });
    }

    const detail = await getProductModerationDetail(id);
    return NextResponse.json(detail);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not update product" }, { status: 500 });
  }
}
