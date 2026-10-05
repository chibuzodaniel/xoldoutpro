import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireModeratorPanel } from "@/lib/moderation/panelAccess";

// A reported direct-message conversation, for the moderator Reports queue.
// Private by default: moderators can only open a conversation one of its two
// people has reported (a Report row pointing at it), never any other.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireModeratorPanel(req, "reports");
    const { id } = await params;
    const reported = await db.report.count({ where: { conversationId: id } });
    if (!reported) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [participants, messages] = await Promise.all([
      db.conversationParticipant.findMany({
        where: { conversationId: id },
        select: { user: { select: { id: true, handle: true, displayName: true } } },
      }),
      db.directMessage.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, senderId: true, kind: true, body: true, imageUrl: true, shareType: true, shareId: true, deletedAt: true, createdAt: true },
      }),
    ]);
    return NextResponse.json({
      participants: participants.map((p) => p.user),
      messages: messages.reverse(),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
