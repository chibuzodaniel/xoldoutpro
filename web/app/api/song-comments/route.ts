import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, getOptionalUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";
import {
  SONG_COMMENT_MAX_LENGTH,
  SONG_COMMENT_PAGE,
  resolveSong,
  songCommentSelect,
  songUrl,
  viewerVotes,
  SONG_KINDS,
} from "@/lib/music/songComments";

// YouTube-style song comments under the player (explicit ask, 2026-11-04).
// Fetched only when the player's Comments tab is open — never polled.

const listSchema = z.object({
  kind: z.enum(SONG_KINDS),
  trackId: z.string().min(1).max(64),
  sort: z.enum(["top", "new"]).default("top"),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
});

export async function GET(req: NextRequest) {
  const parsed = listSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { kind, trackId, sort, offset } = parsed.data;

  const where = { trackKind: kind, trackId, parentId: null };
  const [song, rows, total, viewer] = await Promise.all([
    offset === 0 ? resolveSong(kind, trackId) : Promise.resolve(undefined),
    db.songComment.findMany({
      where,
      orderBy: sort === "top" ? [{ likeCount: "desc" }, { replyCount: "desc" }, { createdAt: "desc" }] : [{ createdAt: "desc" }],
      skip: offset,
      take: SONG_COMMENT_PAGE + 1,
      select: songCommentSelect,
    }),
    // YouTube's header count includes replies.
    offset === 0 ? db.songComment.count({ where: { trackKind: kind, trackId } }) : Promise.resolve(undefined),
    getOptionalUser(req),
  ]);
  if (song === null) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const page = rows.slice(0, SONG_COMMENT_PAGE);
  const votes = await viewerVotes(viewer?.id, page.map((c) => c.id));
  return NextResponse.json({
    comments: page.map((c) => ({ ...c, myVote: votes.get(c.id) ?? 0 })),
    nextOffset: rows.length > SONG_COMMENT_PAGE ? offset + SONG_COMMENT_PAGE : null,
    total,
    creatorId: song?.creatorId,
  });
}

const createSchema = z.object({
  kind: z.enum(SONG_KINDS),
  trackId: z.string().min(1).max(64),
  body: z.string().trim().min(1).max(SONG_COMMENT_MAX_LENGTH),
  parentId: z.string().min(1).max(64).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { kind, trackId, body, parentId } = createSchema.parse(await req.json());

    const [song, parent] = await Promise.all([
      resolveSong(kind, trackId),
      parentId
        ? db.songComment.findUnique({
            where: { id: parentId },
            select: { id: true, parentId: true, trackKind: true, trackId: true, authorId: true },
          })
        : Promise.resolve(null),
    ]);
    if (!song) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (parentId && (!parent || parent.trackKind !== kind || parent.trackId !== trackId)) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    // One level of replies, as on YouTube: answering a reply files it under
    // the same top-level comment (the client @-mentions who it answers).
    const topId = parent ? (parent.parentId ?? parent.id) : null;
    const [comment] = await db.$transaction([
      db.songComment.create({
        data: { trackKind: kind, trackId, productId: song.productId, authorId: user.id, parentId: topId, body },
        select: songCommentSelect,
      }),
      ...(topId ? [db.songComment.update({ where: { id: topId }, data: { replyCount: { increment: 1 } } })] : []),
    ]);

    const recipient = parent ? parent.authorId : song.creatorId;
    if (recipient !== user.id) {
      notifyUsersAfterResponse([recipient], {
        kind: "COMMENT",
        title: parent ? "New reply" : kind === "product" ? "New comment" : "New comment on your song",
        body: `${user.displayName}: ${body.slice(0, 120)}`,
        url: songUrl(kind, song.productId, "productType" in song ? song.productType : undefined),
        icon: comment.author.avatarUrl ?? undefined,
        tag: `song-comment-${topId ?? comment.id}`,
      });
    }
    return NextResponse.json({ comment: { ...comment, myVote: 0 } }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
