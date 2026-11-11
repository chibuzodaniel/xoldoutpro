import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { loadCommentablePost, postCommentSelect, viewerCommentVotes } from "@/lib/social/postComments";

// Replies under one top-level post comment, oldest first. Loaded only when
// someone taps "N replies".
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { id, commentId } = await params;
  const viewer = await getOptionalUser(req);
  if (!(await loadCommentablePost(id, viewer?.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const replies = await db.comment.findMany({
    where: { parentId: commentId, postId: id },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: postCommentSelect,
  });
  const votes = await viewerCommentVotes(viewer?.id, replies.map((r) => r.id));
  return NextResponse.json({ replies: replies.map((r) => ({ ...r, myVote: votes.get(r.id) ?? 0 })) });
}
