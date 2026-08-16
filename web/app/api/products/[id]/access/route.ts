import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Track list + preview windows are public browsing info — served to signed-out
// visitors too (entitled/isOwner just default false). Only /api/orders (the
// actual purchase) requires a signed-in user.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser(req);
  const { id } = await params;

  const product = await db.product.findUnique({
    where: { id },
    include: { release: { include: { tracks: { orderBy: { order: "asc" } } } } },
  });
  if (!product || !product.release) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entitlement = user
    ? await db.entitlement.findUnique({ where: { userId_productId: { userId: user.id, productId: id } } })
    : null;
  const entitled = Boolean(entitlement && !entitlement.revokedAt);

  return NextResponse.json({
    entitled,
    isOwner: user ? product.creatorId === user.id : false,
    tracks: product.release.tracks.map((t) => ({
      id: t.id,
      title: t.title,
      order: t.order,
      durationSec: t.durationSec,
      previewStartSec: t.previewStartSec,
      previewEndSec: t.previewEndSec,
      lyricsText: t.lyricsText,
    })),
  });
}
