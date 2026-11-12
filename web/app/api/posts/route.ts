import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyMentions } from "@/lib/notifications/mentions";

const authorSelect = {
  select: { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true, verificationBadges: true, countryCode: true },
} as const;

// Attached product / event preview (Socials v2).
const attachmentInclude = {
  attachedProduct: {
    select: {
      id: true,
      type: true,
      title: true,
      priceKobo: true,
      status: true,
      creator: { select: { displayName: true } },
      release: { select: { artworkLadder: true } },
      beat: { select: { coverImageLadder: true } },
      merchItem: { select: { imageLadder: true } },
    },
  },
  attachedEvent: {
    select: { id: true, title: true, status: true, startsAt: true, coverImageLadder: true, creator: { select: { displayName: true } } },
  },
} as const;

type PostRow = Prisma.PostGetPayload<{
  include: {
    author: typeof authorSelect;
    _count: { select: { likes: true; comments: true; reposts: true } };
    likes: { select: { userId: true } };
    reposts: { select: { authorId: true } };
  } & typeof attachmentInclude;
}>;

const PRODUCT_PATH: Record<string, string> = { RELEASE: "r", BEAT: "b", MERCH: "m" };
function ladderImage(l: unknown) {
  const ladder = l as Record<string, string> | null | undefined;
  return ladder?.["256"] ?? ladder?.["1024"] ?? null;
}

function attachment(p: PostRow) {
  const prod = p.attachedProduct;
  if (prod && prod.status === "PUBLISHED") {
    return {
      kind: prod.type,
      id: prod.id,
      title: prod.title,
      subtitle: prod.creator.displayName,
      priceKobo: prod.priceKobo,
      imageUrl: ladderImage(prod.release?.artworkLadder ?? prod.beat?.coverImageLadder ?? prod.merchItem?.imageLadder),
      href: `/${PRODUCT_PATH[prod.type] ?? "r"}/${prod.id}`,
    };
  }
  const ev = p.attachedEvent;
  if (ev && ev.status === "PUBLISHED") {
    return {
      kind: "EVENT",
      id: ev.id,
      title: ev.title,
      subtitle: `${ev.creator.displayName} · ${ev.startsAt.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}`,
      priceKobo: null,
      imageUrl: ladderImage(ev.coverImageLadder),
      href: `/e/${ev.id}`,
    };
  }
  return null;
}

function serialize(p: PostRow, viewerId: string, followedIds: Set<string>) {
  return {
    id: p.id,
    body: p.body,
    imageUrl: p.imageUrl,
    createdAt: p.createdAt,
    author: p.author,
    likeCount: p._count.likes,
    likedByMe: p.likes.length > 0,
    commentCount: p._count.comments,
    followedByMe: followedIds.has(p.authorId),
    // v2 fields (the mobile app ignores them).
    audience: p.audience,
    repostCount: p._count.reposts,
    repostedByMe: p.reposts.some((r) => r.authorId === viewerId),
    attachment: attachment(p),
  };
}

// Two modes, both non-group posts, both strictly newest-first (explicit ask:
// recency over ranking) — the difference is the candidate *pool*:
//   "following" (default) — creators you follow, plus your own posts.
//   "forYou" (?feed=forYou) — every post, so new creators surface.
// Either way a "Followers only" post is shown only to the author's followers
// (and the author). Reposts appear only for clients that ask with ?v=2 — the
// mobile app doesn't, so it never gets an empty repost row.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const forYou = req.nextUrl.searchParams.get("feed") === "forYou";
    const v2 = req.nextUrl.searchParams.get("v") === "2";
    // One person's posts (profile "View Socials posts", 2026-11-11). Same audience rules.
    const authorId = req.nextUrl.searchParams.get("author");

    const follows = await db.follow.findMany({ where: { followerId: user.id }, select: { followed: authorSelect } });
    const following = follows.map((f) => f.followed);
    const followedIds = new Set(following.map((f) => f.id));
    const canSee = [...followedIds, user.id];

    const include = {
      author: authorSelect,
      _count: { select: { likes: true, comments: true, reposts: true } },
      likes: { where: { userId: user.id }, select: { userId: true } },
      reposts: { where: { authorId: user.id }, select: { authorId: true } },
      ...attachmentInclude,
    } as const;

    const posts = await db.post.findMany({
      where: {
        groupId: null,
        ...(authorId ? { authorId } : forYou ? {} : { authorId: { in: canSee } }),
        ...(v2 ? {} : { repostOfId: null }),
        OR: [{ audience: "EVERYONE" }, { authorId: { in: canSee } }],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { ...include, repostOf: { include } },
    });

    return NextResponse.json({
      following,
      posts: posts
        // A repost of something this viewer may not see (or that's gone) is skipped.
        .filter((p) => !p.repostOfId || (p.repostOf && (p.repostOf.audience === "EVERYONE" || canSee.includes(p.repostOf.authorId))))
        .map((p) => ({
          ...serialize(p, user.id, followedIds),
          repostOf: p.repostOf ? serialize(p.repostOf as PostRow, user.id, followedIds) : null,
        })),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const createSchema = z.object({
  body: z.string().trim().min(1).max(500),
  imageUrl: z.string().url().nullish(),
  // v2 (optional — the mobile app sends neither).
  audience: z.enum(["EVERYONE", "FOLLOWERS"]).default("EVERYONE"),
  attachedProductId: z.string().min(1).max(64).optional(),
  attachedEventId: z.string().min(1).max(64).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { body, imageUrl, audience, attachedProductId, attachedEventId } = createSchema.parse(await req.json());

    if (attachedProductId) {
      const p = await db.product.findUnique({ where: { id: attachedProductId }, select: { status: true, type: true } });
      if (!p || p.status !== "PUBLISHED" || p.type === "EVENT") return NextResponse.json({ error: "Can't attach that" }, { status: 400 });
    }
    if (attachedEventId) {
      const e = await db.event.findUnique({ where: { id: attachedEventId }, select: { status: true } });
      if (!e || e.status !== "PUBLISHED") return NextResponse.json({ error: "Can't attach that" }, { status: 400 });
    }

    const include = {
      author: authorSelect,
      _count: { select: { likes: true, comments: true, reposts: true } },
      likes: { where: { userId: user.id }, select: { userId: true } },
      reposts: { where: { authorId: user.id }, select: { authorId: true } },
      ...attachmentInclude,
    } as const;
    const post = await db.post.create({
      data: {
        authorId: user.id,
        body,
        imageUrl: imageUrl ?? null,
        audience,
        attachedProductId: attachedProductId ?? null,
        attachedEventId: attachedProductId ? null : (attachedEventId ?? null),
      },
      include,
    });
    await notifyMentions({ body, author: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl }, url: "/socials", where: "a post" });

    return NextResponse.json({ post: { ...serialize(post, user.id, new Set()), repostOf: null } });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
