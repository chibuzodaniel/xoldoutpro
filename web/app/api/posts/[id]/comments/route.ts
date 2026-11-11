import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, getOptionalUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";
import { notifyMentions } from "@/lib/notifications/mentions";
import { POST_COMMENT_MAX_LENGTH, POST_COMMENT_PAGE, loadCommentablePost, postCommentSelect, viewerCommentVotes } from "@/lib/social/postComments";

// Post comments. `?v=2` (the web app, explicit ask 2026-11-11) is the
// YouTube-style list: top-level comments only, Top/Newest, paged, with
// like counts, reply counts and the viewer's own vote — same shape as
// /api/song-comments so one UI renders both. Without it (the mobile app)
// the response is the original flat list, oldest first, unchanged.
const listSchema = z.object({
  sort: z.enum(["top", "new"]).default("top"),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (req.nextUrl.searchParams.get("v") !== "2") {
    const comments = await db.comment.findMany({
      where: { postId: id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { handle: true, displayName: true, avatarUrl: true } } },
    });
    return NextResponse.json({ comments });
  }

  const parsed = listSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { sort, offset } = parsed.data;
  const viewer = await getOptionalUser(req);
  const post = await loadCommentablePost(id, viewer?.id);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [rows, total] = await Promise.all([
    db.comment.findMany({
      where: { postId: id, parentId: null },
      orderBy: sort === "top" ? [{ likeCount: "desc" }, { replyCount: "desc" }, { createdAt: "desc" }] : [{ createdAt: "desc" }],
      skip: offset,
      take: POST_COMMENT_PAGE + 1,
      select: postCommentSelect,
    }),
    offset === 0 ? db.comment.count({ where: { postId: id } }) : Promise.resolve(undefined),
  ]);
  const page = rows.slice(0, POST_COMMENT_PAGE);
  const votes = await viewerCommentVotes(viewer?.id, page.map((c) => c.id));
  return NextResponse.json({
    comments: page.map((c) => ({ ...c, myVote: votes.get(c.id) ?? 0 })),
    nextOffset: rows.length > POST_COMMENT_PAGE ? offset + POST_COMMENT_PAGE : null,
    total,
    creatorId: post.authorId,
    canModerate: post.viewerIsGroupAdmin || Boolean(viewer?.isModerator) || viewer?.id === post.authorId,
  });
}

const bodySchema = z.object({
  body: z.string().trim().min(1).max(POST_COMMENT_MAX_LENGTH),
  parentId: z.string().min(1).max(64).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { body, parentId } = bodySchema.parse(await req.json());

    const post = await loadCommentablePost(id, user.id);
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parent = parentId ? await db.comment.findUnique({ where: { id: parentId }, select: { id: true, postId: true, parentId: true, authorId: true } }) : null;
    if (parentId && (!parent || parent.postId !== id)) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

    // One level of replies, as on YouTube.
    const topId = parent ? (parent.parentId ?? parent.id) : null;
    const [comment] = await db.$transaction([
      db.comment.create({
        data: { postId: id, authorId: user.id, body, parentId: topId },
        select: { ...postCommentSelect, postId: true, authorId: true },
      }),
      ...(topId ? [db.comment.update({ where: { id: topId }, data: { replyCount: { increment: 1 } } })] : []),
    ]);

    const url = post.groupId ? `/groups/${post.groupId}` : `/socials`;
    const recipient = parent ? parent.authorId : post.authorId;
    if (recipient !== user.id) {
      notifyUsersAfterResponse([recipient], {
        kind: "COMMENT",
        title: parent ? "New reply" : "New comment",
        body: `${user.displayName}: ${body.slice(0, 120)}`,
        url,
        icon: comment.author.avatarUrl ?? undefined,
        tag: `comment-${id}`,
      });
    }
    await notifyMentions({
      body,
      author: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl },
      url,
      where: "a comment",
      exclude: [post.authorId, recipient],
    });
    // `author` keeps the fields the mobile app reads; the rest is additive.
    return NextResponse.json({ comment: { ...comment, myVote: 0 } }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
