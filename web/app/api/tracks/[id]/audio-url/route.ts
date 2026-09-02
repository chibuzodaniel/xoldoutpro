import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { presignDownload } from "@/lib/storage/r2";

// Paid audio is never a permanent public link (PRD §16) — every playback
// goes through a short-TTL signed GET issued per request. Signed-out
// visitors can preview too (entitled forced false) — only an entitled
// listener gets the full-length stream.
//
// Fixed gap (see DECISIONS.md): a non-entitled request used to be signed
// the exact same full-length `audioStreamUrl` an entitled buyer gets, with
// only the preview window enforced client-side in the player — anyone
// calling this endpoint directly, or just inspecting the network tab,
// could download the entire unpurchased track. A non-entitled request now
// only ever gets `previewAudioUrl`, a real short clip physically trimmed to
// [previewStartSec, previewEndSec) at publish time (lib/audio/
// generatePreviewClip.ts) — the full file is never signed for it. Rows
// published before this existed have no previewAudioUrl yet; they fall
// back to the old (unsafe) behavior until backfilled via
// /api/internal/backfill-preview-clips.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getOptionalUser(req);
    const { id } = await params;

    const track = await db.track.findUnique({ where: { id }, include: { release: { include: { product: true } } } });
    if (!track || !track.audioStreamUrl) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let entitled = false;
    if (user) {
      const productId = track.release.productId;
      const entitlement = await db.entitlement.findFirst({ where: { userId: user.id, productId } });
      entitled = Boolean((entitlement && !entitlement.revokedAt) || track.release.product.creatorId === user.id);
    }

    const keyToSign = entitled ? track.audioStreamUrl : (track.previewAudioUrl ?? track.audioStreamUrl);
    const url = await presignDownload(keyToSign, 300);

    // Fire-and-forget play signal for the Socials "suggested" feed ranking
    // (creators you play often) — never let a logging failure break playback.
    if (user) {
      db.trackPlay
        .create({ data: { userId: user.id, creatorId: track.release.product.creatorId } })
        .catch((err) => console.error("trackPlay log failed", err));
    }

    // The player's existing seek-clamping (PlayerProvider.seekTo) and "Preview
    // only" banner (ExpandedPlayer) both key off previewStartSec/EndSec being
    // non-null, clamped against the *served* file's own timeline — a real
    // preview clip's timeline starts at 0 (it's a standalone short file, not
    // a byte range of the original), so its window is [0, duration-of-window]
    // rather than the original track's [previewStartSec, previewEndSec].
    // Passing that through unchanged needed no player-side changes at all.
    const usingRealPreviewClip = !entitled && Boolean(track.previewAudioUrl);
    return NextResponse.json({
      url,
      entitled,
      previewStartSec: entitled ? null : usingRealPreviewClip ? 0 : track.previewStartSec,
      previewEndSec: entitled ? null : usingRealPreviewClip ? track.previewEndSec - track.previewStartSec : track.previewEndSec,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
