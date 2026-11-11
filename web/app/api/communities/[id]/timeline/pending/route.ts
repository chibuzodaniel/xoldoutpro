import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { timelineViewer, timelineInclude, serializeTimelinePost, adminIdsFor } from "@/lib/communities/timeline";

// Pending submissions (Approval Required): admins only, oldest first.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const v = await timelineViewer(id, user.id);
    if (!v || !v.isAdmin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const [rows, adminIds] = await Promise.all([
      db.post.findMany({ where: { groupId: id, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 100, include: timelineInclude(user.id) }),
      adminIdsFor(id, v.group.creatorId),
    ]);
    return NextResponse.json({ posts: rows.map((p) => serializeTimelinePost(p, user.id, adminIds)) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
