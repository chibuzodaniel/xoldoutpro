import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertCanPublish, recordProductsPublished, UploadCapError } from "@/lib/commerce/creatorPlans";
import { variantInputSchema, MAX_VARIANTS } from "@/lib/commerce/variants";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  priceKobo: z.number().int().min(0),
  shippingFeeKobo: z.number().int().min(0).default(0),
  cap: z.number().int().positive().nullable(),
  imageLadder: z.record(z.string(), z.string()),
  galleryImageUrls: z.array(z.string()).max(8).default([]),
  // Sizes & colours (lib/commerce/variants.ts) — optional; none = one plain listing as before.
  variants: z.array(variantInputSchema).max(MAX_VARIANTS).default([]),
  sizeGuide: z.string().trim().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    await assertCanPublish(user);
    const body = createSchema.parse(await req.json());

    const product = await db.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          creatorId: user.id,
          type: "MERCH",
          title: body.title,
          description: body.description,
          priceKobo: body.priceKobo,
          status: "PUBLISHED",
          publishedAt: new Date(),
          merchItem: {
            create: {
              imageLadder: body.imageLadder,
              galleryImageUrls: body.galleryImageUrls,
              shippingFeeKobo: body.shippingFeeKobo,
              sizeGuide: body.sizeGuide || null,
            },
          },
          stockPolicy: { create: { cap: body.cap } },
          merchVariants: {
            create: body.variants.map((v, i) => ({ size: v.size?.trim() || null, color: v.color?.trim() || null, cap: v.cap ?? null, order: i })),
          },
        },
        include: { merchItem: true, stockPolicy: true, merchVariants: true },
      });
      return created;
    });
    await recordProductsPublished(user.id, 1);

    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof UploadCapError) return NextResponse.json({ error: err.message, reason: err.reason }, { status: 403 });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not publish merchandise" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const products = await db.product.findMany({
      where: { creatorId: user.id, type: "MERCH" },
      include: { merchItem: true, stockPolicy: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ products });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
