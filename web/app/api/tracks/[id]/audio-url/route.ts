import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { presignDownload } from "@/lib/storage/r2";

// Paid audio is never a permanent public link (PRD §16) — every playback
// goes through a short-TTL signed GET issued per request. Signed-out
// visitors can preview too (entitled forced false, preview window applies) —
// only the full unrestricted stream requires an entitlement.
//
// Known gap (see DECISIONS.md): the same streaming file is signed for both
// buyers and previewers; the preview window is enforced client-side in the
// player rather than by serving a server-trimmed clip. Good enough for the
// PRD's literal seek-boundary requirement, not a real DRM boundary.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getOptionalUser(req);
    const { id } = await params;

    const track = await db.track.findUnique({ where: { id }, include: { release: { include: { product: true } } } });
    if (!track || !track.audioStreamUrl) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let entitled = false;
    if (user) {
      const productId = track.release.productId;
      const entitlement = await db.entitlement.findUnique({
        where: { userId_productId: { userId: user.id, productId } },
      });
      entitled = Boolean((entitlement && !entitlement.revokedAt) || track.release.product.creatorId === user.id);
    }

    const url = await presignDownload(track.audioStreamUrl, 300);

    // Fire-and-forget play signal for the Socials "suggested" feed ranking
    // (creators you play often) — never let a logging failure break playback.
    if (user) {
      db.trackPlay
        .create({ data: { userId: user.id, creatorId: track.release.product.creatorId } })
        .catch((err) => console.error("trackPlay log failed", err));
    }

    return NextResponse.json({
      url,
      entitled,
      previewStartSec: entitled ? null : track.previewStartSec,
      previewEndSec: entitled ? null : track.previewEndSec,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
