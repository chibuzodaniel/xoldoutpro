import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  priceKobo: z.number().int().min(0),
  shippingFeeKobo: z.number().int().min(0).default(0),
  cap: z.number().int().positive().nullable(),
  imageLadder: z.record(z.string(), z.string()),
  galleryImageUrls: z.array(z.string()).max(8).default([]),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
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
            },
          },
          stockPolicy: { create: { cap: body.cap } },
        },
        include: { merchItem: true, stockPolicy: true },
      });
      return created;
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
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
