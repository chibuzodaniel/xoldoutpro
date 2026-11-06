import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { songCommentSelect, viewerVotes } from "@/lib/music/songComments";

// Replies under one top-level song comment, oldest first (YouTube order).
// Loaded only when someone taps "N replies".
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [replies, viewer] = await Promise.all([
    db.songComment.findMany({
      where: { parentId: id },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: songCommentSelect,
    }),
    getOptionalUser(req),
  ]);
  const votes = await viewerVotes(viewer?.id, replies.map((r) => r.id));
  return NextResponse.json({ replies: replies.map((r) => ({ ...r, myVote: votes.get(r.id) ?? 0 })) });
}
