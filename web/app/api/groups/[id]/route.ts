import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, getOptionalUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const group = await db.fanbaseGroup.findUnique({
    where: { id },
    include: { creator: { select: { handle: true, displayName: true } }, _count: { select: { memberships: true } } },
  });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await getOptionalUser(req);
  const [membership, joinRequest] = user
    ? await Promise.all([
        db.membership.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } }),
        db.joinRequest.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } }),
      ])
    : [null, null];

  return NextResponse.json({
    group: {
      id: group.id,
      name: group.name,
      description: group.description,
      coverImageUrl: group.coverImageUrl,
      visibility: group.visibility,
      postPermission: group.postPermission,
      creator: group.creator,
      creatorId: group.creatorId,
      memberCount: group._count.memberships,
      isVerified: group.isVerified,
      verificationRequestedAt: group.verificationRequestedAt,
    },
    myRole: membership?.role ?? null,
    joinRequestStatus: joinRequest?.status ?? null,
  });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(500).optional(),
  visibility: z.enum(["OPEN", "REQUEST_TO_JOIN"]).optional(),
  postPermission: z.enum(["CREATOR_ONLY", "ADMINS", "ALL_MEMBERS"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const group = await db.fanbaseGroup.findUnique({ where: { id } });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (group.creatorId !== user.id) return NextResponse.json({ error: "Only the creator can change group settings" }, { status: 403 });

    const updated = await db.fanbaseGroup.update({ where: { id }, data: body });
    return NextResponse.json({ group: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}

// No onDelete: Cascade in the schema (same reasoning as post deletion —
// a hard FK is a guard rail against an accidental delete silently wiping
// everything downstream), so every post's dependents get cleaned up
// explicitly here before the posts themselves, then the group's own rows.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const group = await db.fanbaseGroup.findUnique({ where: { id } });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (group.creatorId !== user.id) return NextResponse.json({ error: "Only the creator can delete this group" }, { status: 403 });

    const postIdRows = await db.post.findMany({ where: { groupId: id }, select: { id: true } });
    const postIds = postIdRows.map((p) => p.id);

    await db.$transaction([
      db.pollVote.deleteMany({ where: { poll: { postId: { in: postIds } } } }),
      db.poll.deleteMany({ where: { postId: { in: postIds } } }),
      db.postLike.deleteMany({ where: { postId: { in: postIds } } }),
      db.comment.deleteMany({ where: { postId: { in: postIds } } }),
      db.report.deleteMany({ where: { postId: { in: postIds } } }),
      db.post.deleteMany({ where: { groupId: id } }),
      db.joinRequest.deleteMany({ where: { groupId: id } }),
      db.membership.deleteMany({ where: { groupId: id } }),
      db.fanbaseGroup.delete({ where: { id } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
