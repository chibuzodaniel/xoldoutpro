import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const product = await db.product.findUnique({
      where: { id },
      include: { release: { include: { tracks: { orderBy: { order: "asc" } } } } },
    });
    if (!product || !product.release) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const entitlement = await db.entitlement.findUnique({
      where: { userId_productId: { userId: user.id, productId: id } },
    });
    const entitled = Boolean(entitlement && !entitlement.revokedAt);

    return NextResponse.json({
      entitled,
      isOwner: product.creatorId === user.id,
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
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
