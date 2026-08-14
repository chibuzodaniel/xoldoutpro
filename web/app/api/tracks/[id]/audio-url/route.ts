import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { presignDownload } from "@/lib/storage/r2";

// Paid audio is never a permanent public link (PRD §16) — every playback
// goes through a short-TTL signed GET issued per request.
//
// Known gap (see DECISIONS.md): the same streaming file is signed for both
// buyers and previewers; the preview window is enforced client-side in the
// player rather than by serving a server-trimmed clip. Good enough for the
// PRD's literal seek-boundary requirement, not a real DRM boundary.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const track = await db.track.findUnique({ where: { id }, include: { release: { include: { product: true } } } });
    if (!track || !track.audioStreamUrl) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const productId = track.release.productId;
    const entitlement = await db.entitlement.findUnique({
      where: { userId_productId: { userId: user.id, productId } },
    });
    const entitled = Boolean((entitlement && !entitlement.revokedAt) || track.release.product.creatorId === user.id);

    const url = await presignDownload(track.audioStreamUrl, 300);

    return NextResponse.json({
      url,
      entitled,
      previewStartSec: entitled ? null : track.previewStartSec,
      previewEndSec: entitled ? null : track.previewEndSec,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
