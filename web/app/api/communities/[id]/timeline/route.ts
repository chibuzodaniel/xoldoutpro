import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";
import { timelineViewer, visibleTo, timelineInclude, serializeTimelinePost, adminIdsFor } from "@/lib/communities/timeline";
import { TIMELINE_KIND_KEYS, ADMIN_ONLY_KINDS, MAX_TIMELINE_MEDIA, RSVP_DEFAULT_OPTIONS, kindLabel } from "@/lib/communities/timelineRules";
import { publicUrlFor } from "@/lib/storage/r2";

// Community Timeline (explicit ask, 2026-11-11): the community's feed — pinned
// posts first, then newest first, 20 at a time. Members only. Includes every
// existing community message (the old General chat and channels).
const PAGE = 20;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const v = await timelineViewer(id, user.id);
    if (!v) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!v.canRead) return NextResponse.json({ error: "Join the community to see its Timeline" }, { status: 403 });

    const before = req.nextUrl.searchParams.get("before");
    const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : null;
    const where = { groupId: id, ...visibleTo(user.id, v.isAdmin) };
    const [pinned, rows, adminIds, pendingCount] = await Promise.all([
      beforeDate
        ? Promise.resolve([])
        : db.post.findMany({ where: { ...where, pinnedAt: { not: null } }, orderBy: { pinnedAt: "desc" }, take: 5, include: timelineInclude(user.id) }),
      db.post.findMany({
        where: { ...where, pinnedAt: null, ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}) },
        orderBy: { createdAt: "desc" },
        take: PAGE + 1,
        include: timelineInclude(user.id),
      }),
      adminIdsFor(id, v.group.creatorId),
      v.isAdmin && !beforeDate ? db.post.count({ where: { groupId: id, status: "PENDING" } }) : Promise.resolve(0),
    ]);
    const page = rows.slice(0, PAGE);
    return NextResponse.json({
      posts: [...pinned, ...page].map((p) => serializeTimelinePost(p, user.id, adminIds)),
      nextBefore: rows.length > PAGE ? page[page.length - 1].createdAt.toISOString() : null,
      viewer: { isAdmin: v.isAdmin, publish: v.publish, mode: v.mode },
      pendingCount,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const mediaSchema = z.object({ url: z.string().url().max(600), type: z.enum(["image", "video"]) });
const createSchema = z.object({
  kind: z.enum(TIMELINE_KIND_KEYS).default("POST"),
  body: z.string().trim().max(5000).default(""),
  media: z.array(mediaSchema).max(MAX_TIMELINE_MEDIA).default([]),
  poll: z
    .object({
      options: z.array(z.string().trim().min(1).max(80)).min(2).max(8).optional(),
      closesAt: z.string().datetime().nullable().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const body = createSchema.parse(await req.json());
    const v = await timelineViewer(id, user.id);
    if (!v) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!v.publish) {
      return NextResponse.json({ error: v.mode === "ADMIN_ONLY" ? "Only admins can post in this community" : "You can't post in this community" }, { status: 403 });
    }
    if (ADMIN_ONLY_KINDS.has(body.kind) && !v.isAdmin) {
      return NextResponse.json({ error: `Only admins can post a ${kindLabel(body.kind).toLowerCase()}` }, { status: 403 });
    }
    if (!body.body && body.media.length === 0) return NextResponse.json({ error: "Write something or add a photo or video" }, { status: 400 });
    // Media must be this user's own uploads.
    const own = publicUrlFor(`postmedia/${user.id}/`);
    if (body.media.some((m) => !m.url.startsWith(own))) return NextResponse.json({ error: "Upload the photos again" }, { status: 400 });

    const isPoll = body.kind === "POLL";
    const isRsvp = body.kind === "EVENT_RSVP";
    if (isPoll && (!body.poll?.options || body.poll.options.length < 2)) return NextResponse.json({ error: "A poll needs at least two options" }, { status: 400 });
    const closesAt = body.poll?.closesAt ? new Date(body.poll.closesAt) : null;
    if (closesAt && closesAt.getTime() <= Date.now()) return NextResponse.json({ error: "The closing time must be in the future" }, { status: 400 });
    const pollOptions = isRsvp ? (body.poll?.options?.length ? body.poll.options : RSVP_DEFAULT_OPTIONS) : (body.poll?.options ?? []);

    const post = await db.post.create({
      data: {
        authorId: user.id,
        groupId: id,
        kind: body.kind,
        status: v.publish,
        body: body.body,
        // Older clients (the mobile chat) show the first photo.
        imageUrl: body.media.find((m) => m.type === "image")?.url ?? null,
        media: body.media,
        poll: isPoll || isRsvp ? { create: { kind: isRsvp ? "RSVP" : "POLL", options: pollOptions, closesAt } } : undefined,
      },
      include: timelineInclude(user.id),
    });

    const adminIds = await adminIdsFor(id, v.group.creatorId);
    const preview = body.body.slice(0, 100) || (body.media.length ? "📷 New photos" : kindLabel(body.kind));
    const important = body.kind === "ANNOUNCEMENT" || body.kind === "EVENT_RSVP";
    if (v.publish === "PUBLISHED") {
      const members = await db.membership.findMany({ where: { groupId: id, userId: { not: user.id } }, select: { userId: true } });
      notifyUsersAfterResponse(
        members.map((m) => m.userId),
        {
          kind: "FANBASE",
          title: important ? `📣 ${v.group.name}` : v.group.name,
          body: `${user.displayName}: ${preview}`,
          url: `/groups/${id}?post=${post.id}`,
          icon: user.avatarUrl ?? undefined,
          actorId: user.id,
          tag: important ? undefined : `fanbase-${id}`,
        },
      );
    } else {
      notifyUsersAfterResponse(
        [...adminIds].filter((a) => a !== user.id),
        { kind: "FANBASE", title: `Post to review in ${v.group.name}`, body: `${user.displayName}: ${preview}`, url: `/groups/${id}?review=1`, tag: `fanbase-review-${id}` },
      );
    }
    return NextResponse.json({ post: serializeTimelinePost(post, user.id, adminIds) }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid post" }, { status: 400 });
    throw err;
  }
}
