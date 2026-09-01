import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { presignDownload } from "@/lib/storage/r2";

// Mirrors app/api/tracks/[id]/audio-url, with one Beat-specific difference
// (DECISIONS.md, single flat license): an entitled buyer gets the real
// master file, not just an unrestricted stream of the same preview
// rendition — a beat purchase is a license to the actual file, not just
// unlocked in-app playback. Signed-out visitors can preview too (entitled
// forced false), and — see that route's own comment for the fuller story —
// now only ever get `previewAudioUrl`, a real short clip physically trimmed
// at publish time, never the full-length stream or the master.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getOptionalUser(req);
    const { id } = await params;

    const product = await db.product.findUnique({ where: { id }, include: { beat: true } });
    if (!product || !product.beat || !product.beat.audioStreamUrl) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let entitled = false;
    if (user) {
      const entitlement = await db.entitlement.findUnique({
        where: { userId_productId: { userId: user.id, productId: id } },
      });
      entitled = Boolean((entitlement && !entitlement.revokedAt) || product.creatorId === user.id);

      // Fire-and-forget play signal for the Socials "suggested" feed ranking
      // (creators you play often) — never let a logging failure break playback.
      db.trackPlay
        .create({ data: { userId: user.id, creatorId: product.creatorId } })
        .catch((err) => console.error("trackPlay log failed", err));
    }

    if (entitled) {
      const url = await presignDownload(product.beat.audioMasterUrl, 300);
      return NextResponse.json({ url, entitled: true, previewStartSec: null, previewEndSec: null });
    }

    // Rows published before previewAudioUrl existed fall back to the old
    // (unsafe) full-stream behavior until backfilled — see
    // /api/internal/backfill-preview-clips.
    const usingRealPreviewClip = Boolean(product.beat.previewAudioUrl);
    const keyToSign = product.beat.previewAudioUrl ?? product.beat.audioStreamUrl;
    const url = await presignDownload(keyToSign, 300);
    return NextResponse.json({
      url,
      entitled: false,
      previewStartSec: usingRealPreviewClip ? 0 : product.beat.previewStartSec,
      previewEndSec: usingRealPreviewClip
        ? product.beat.previewEndSec - product.beat.previewStartSec
        : product.beat.previewEndSec,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
