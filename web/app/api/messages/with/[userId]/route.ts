import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { conversationIdWith } from "@/lib/messages";
import { messageErrorResponse } from "@/lib/messages/http";

// For a profile's Message button and the "new message" screen: who this is,
// the existing conversation with them (if any), and whether either side has
// blocked the other.
export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { userId } = await params;
    const [other, conversationId, blockedByMe, blockedMe] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true, deletedAt: true },
      }),
      conversationIdWith(user.id, userId),
      db.userBlock.count({ where: { blockerId: user.id, blockedId: userId } }),
      db.userBlock.count({ where: { blockerId: userId, blockedId: user.id } }),
    ]);
    if (!other || other.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const person = { id: other.id, handle: other.handle, displayName: other.displayName, avatarUrl: other.avatarUrl, isVerified: other.isVerified };
    return NextResponse.json({ user: person, conversationId, blockedByMe: blockedByMe > 0, blockedMe: blockedMe > 0 });
  } catch (err) {
    return messageErrorResponse(err);
  }
}
