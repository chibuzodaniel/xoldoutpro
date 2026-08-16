import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Public browsing info — served to signed-out visitors too (entitled/isOwner
// default false). Only /api/orders (the actual purchase) requires a signed-in user.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser(req);
  const { id } = await params;

  const product = await db.product.findUnique({ where: { id }, include: { beat: true } });
  if (!product || !product.beat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entitlement = user
    ? await db.entitlement.findUnique({ where: { userId_productId: { userId: user.id, productId: id } } })
    : null;
  const entitled = Boolean(entitlement && !entitlement.revokedAt);

  return NextResponse.json({
    entitled,
    isOwner: user ? product.creatorId === user.id : false,
    durationSec: product.beat.durationSec,
    previewStartSec: product.beat.previewStartSec,
    previewEndSec: product.beat.previewEndSec,
  });
}
