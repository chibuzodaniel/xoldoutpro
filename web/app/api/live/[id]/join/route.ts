import { NextRequest, NextResponse, after } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { createHostToken, createViewerToken, getLiveKitUrl } from "@/lib/live/liveKit";
import { recordViewerJoin } from "@/lib/live/sessions";
import { hasLiveAccess } from "@/lib/live/spend";

// Issues a LiveKit join token — host (full publish + room admin) for the
// session's own creator, subscribe-only viewer otherwise. A paid session
// gates here: no access grant yet, no token; the client is expected to call
// POST /api/live/[id]/access first (lib/live/spend.ts's buyLiveAccess),
// which itself debits XG, then retry this.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const session = await db.liveSession.findUnique({
      where: { id },
      include: {
        creator: { select: { displayName: true, avatarUrl: true } },
        pinnedProduct: { select: { id: true, type: true, title: true, priceKobo: true } },
      },
    });
    if (!session || session.status !== "LIVE" || !session.roomName) return NextResponse.json({ error: "Not live" }, { status: 404 });
    const roomName = session.roomName;

    const isHost = session.creatorId === user.id;
    if (!isHost && session.isPaidAccess) {
      const granted = await hasLiveAccess(id, user.id);
      if (!granted) return NextResponse.json({ error: "Paid access required", requiresPayment: true, priceXg: session.priceXg }, { status: 402 });
    }

    const token = isHost
      ? await createHostToken({ roomName, userId: user.id, displayName: user.displayName })
      : await createViewerToken({ roomName, userId: user.id, displayName: user.displayName });

    // Runs after the response is sent, via after() — NOT a bare fire-and-
    // forget promise. On Vercel the function is suspended once the response
    // goes out, so a dangling LiveKit request froze mid-flight, timed out,
    // and peakViewers silently never updated. after() keeps the invocation
    // alive until this finishes. A failure still never fails the join.
    after(() => recordViewerJoin(id, roomName).catch((err) => console.error("recordViewerJoin failed", err)));

    return NextResponse.json({
      token,
      url: getLiveKitUrl(),
      isHost,
      viewerId: user.id,
      roomName,
      session: { title: session.title, creator: session.creator, pinnedProduct: session.pinnedProduct },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Could not join" }, { status: 500 });
  }
}
