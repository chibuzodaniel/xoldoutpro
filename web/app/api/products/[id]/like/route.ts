import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";

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

    const product = await db.product.findUnique({ where: { id }, select: { status: true, type: true, title: true, creatorId: true } });
    if (!product || product.status !== "PUBLISHED") return NextResponse.json({ error: "Not found" }, { status: 404 });

    let newLike = false;
    const likeCount = await db.$transaction(async (tx) => {
      if (liked) {
        const created = await tx.productLike.createMany({ data: [{ userId: user.id, productId: id }], skipDuplicates: true });
        newLike = created.count > 0;
        if (created.count > 0) await tx.product.update({ where: { id }, data: { likeCount: { increment: 1 } } });
      } else {
        const removed = await tx.productLike.deleteMany({ where: { userId: user.id, productId: id } });
        if (removed.count > 0) await tx.product.update({ where: { id }, data: { likeCount: { decrement: 1 } } });
      }
      return (await tx.product.findUniqueOrThrow({ where: { id }, select: { likeCount: true } })).likeCount;
    });

    // Notify the creator of a brand-new like only (an unlike/re-like toggle
    // can't spam them, and liking your own release says nothing).
    if (newLike && product.creatorId !== user.id) {
      const path = product.type === "BEAT" ? "b" : product.type === "MERCH" ? "m" : product.type === "EVENT" ? "e" : "r";
      notifyUsersAfterResponse([product.creatorId], {
        kind: "LIKE",
        title: "New like",
        body: `${user.displayName} liked ${product.title}`,
        url: `/${path}/${id}`,
        icon: user.avatarUrl ?? undefined,
        actorId: user.id,
        tag: `product-like-${id}`,
      });
    }

    return NextResponse.json({ liked, likeCount: Math.max(0, likeCount) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
