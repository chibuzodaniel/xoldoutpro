import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listingEditState, EDIT_WINDOW_HOURS } from "@/lib/editWindow";

// Everything the Edit release screen needs for one of the seller's own
// products (explicit ask, 2026-11-11), in one request when the screen opens.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const p = await db.product.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        creatorId: true,
        status: true,
        title: true,
        description: true,
        priceKobo: true,
        payWhatYouWant: true,
        publishedAt: true,
        upgradeEditAt: true,
        release: { select: { releaseType: true, genres: true, artworkLadder: true, _count: { select: { tracks: true } } } },
        beat: { select: { genre: true, mood: true, bpm: true, musicalKey: true, tags: true, coverImageLadder: true } },
        beatLicenses: { orderBy: { order: "asc" }, select: { id: true, name: true, priceKobo: true, formats: true, isExclusive: true, terms: true, _count: { select: { orderItems: true } } } },
        merchItem: { select: { category: true, sizeGuide: true, shippingFeeKobo: true, imageLadder: true } },
        merchVariants: { orderBy: { order: "asc" }, select: { id: true, size: true, color: true, cap: true, sold: true, reserved: true } },
      },
    });
    if (!p || p.creatorId !== user.id || p.status === "DELETED" || !["RELEASE", "BEAT", "MERCH"].includes(p.type)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ product: p, listingEdit: listingEditState(p.publishedAt, p.upgradeEditAt), editWindowHours: EDIT_WINDOW_HOURS });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
