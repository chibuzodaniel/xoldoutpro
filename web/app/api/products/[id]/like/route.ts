import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const bodySchema = z.object({ liked: z.boolean() });

// Like / unlike a product (v2 feed card heart, design/v2-prototype,
// 2026-11-09). One like per account; Product.likeCount moves in the same
// transaction as the ProductLike row, and only when the row actually changed,
// so repeated taps can't inflate it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { liked } = bodySchema.parse(await req.json());

    const product = await db.product.findUnique({ where: { id }, select: { status: true } });
    if (!product || product.status !== "PUBLISHED") return NextResponse.json({ error: "Not found" }, { status: 404 });

    const likeCount = await db.$transaction(async (tx) => {
      if (liked) {
        const created = await tx.productLike.createMany({ data: [{ userId: user.id, productId: id }], skipDuplicates: true });
        if (created.count > 0) await tx.product.update({ where: { id }, data: { likeCount: { increment: 1 } } });
      } else {
        const removed = await tx.productLike.deleteMany({ where: { userId: user.id, productId: id } });
        if (removed.count > 0) await tx.product.update({ where: { id }, data: { likeCount: { decrement: 1 } } });
      }
      return (await tx.product.findUniqueOrThrow({ where: { id }, select: { likeCount: true } })).likeCount;
    });

    return NextResponse.json({ liked, likeCount: Math.max(0, likeCount) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
