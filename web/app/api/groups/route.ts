import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getObjectBuffer, putObjectBuffer, publicUrlFor } from "@/lib/storage/r2";
import { resizeSquare } from "@/lib/images";

// PRD §11 Phase 2: "the joined-communities list as the tab root." Default
// (no `discover`) returns groups the user is a member of. `?discover=1`
// browses everything, for finding new ones to join. `?q=` filters by name
// for the Fanbase search bar.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const discover = req.nextUrl.searchParams.get("discover") === "1";
    const q = req.nextUrl.searchParams.get("q")?.trim();

    // createdAt here is a pre-filter, not the final order — with more than
    // 50 candidates the newest 50 *groups* is the closest cheap proxy for
    // "most recently active" without a raw SQL join; re-sorted below by
    // actual last-message time once that's known (explicit ask: latest
    // activity first, WhatsApp-style, not latest-created).
    const groups = await db.fanbaseGroup.findMany({
      where: {
        ...(discover ? {} : { memberships: { some: { userId: user.id } } }),
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: { handle: true, displayName: true, isVerified: true } },
        _count: { select: { memberships: true } },
        memberships: { where: { userId: user.id }, select: { role: true, joinedAt: true, lastReadAt: true } },
      },
      take: 50,
    });

    const memberGroupIds = groups.filter((g) => g.memberships.length > 0).map((g) => g.id);

    // The Fanbase list row (WhatsApp-style reference) needs the actual last
    // message + its sender, not just a timestamp — `distinct` picks one row
    // per group ordered by createdAt, i.e. exactly the latest message each.
    const lastMessages = memberGroupIds.length
      ? await db.post.findMany({
          where: { groupId: { in: memberGroupIds } },
          orderBy: { createdAt: "desc" },
          distinct: ["groupId"],
          select: { groupId: true, body: true, createdAt: true, author: { select: { displayName: true } } },
        })
      : [];
    const lastMessageByGroup = new Map(lastMessages.map((m) => [m.groupId, m]));

    // Most-recent-activity first: a group's last message time if it has one,
    // else when the group itself was created (a brand-new, message-less
    // group still needs a defined position, not to sort last unconditionally).
    groups.sort((a, b) => {
      const aTime = (lastMessageByGroup.get(a.id)?.createdAt ?? a.createdAt).getTime();
      const bTime = (lastMessageByGroup.get(b.id)?.createdAt ?? b.createdAt).getTime();
      return bTime - aTime;
    });

    // Unread = messages newer than the later of (last time this member opened
    // the chat, the day they joined) — a never-opened membership shouldn't
    // report every message posted before they joined as unread.
    const unreadCounts = await Promise.all(
      groups
        .filter((g) => g.memberships.length > 0)
        .map(async (g) => {
          const m = g.memberships[0];
          const since = m.lastReadAt ?? m.joinedAt;
          const count = await db.post.count({ where: { groupId: g.id, createdAt: { gt: since } } });
          return [g.id, count] as const;
        }),
    );
    const unreadByGroup = new Map(unreadCounts);

    // Non-member groups may already have a pending request from a previous
    // visit — surface it so Discover renders "Requested" instead of letting
    // the fan queue up duplicate requests every time they reload the tab.
    const nonMemberGroupIds = groups.filter((g) => g.memberships.length === 0).map((g) => g.id);
    const pendingRequests = nonMemberGroupIds.length
      ? await db.joinRequest.findMany({
          where: { userId: user.id, groupId: { in: nonMemberGroupIds }, status: "PENDING" },
          select: { groupId: true },
        })
      : [];
    const pendingRequestGroupIds = new Set(pendingRequests.map((r) => r.groupId));

    return NextResponse.json({
      groups: groups.map((g) => {
        const lastMessage = lastMessageByGroup.get(g.id);
        return {
          id: g.id,
          name: g.name,
          description: g.description,
          coverImageUrl: g.coverImageUrl,
          visibility: g.visibility,
          creatorId: g.creatorId,
          creator: g.creator,
          memberCount: g._count.memberships,
          myRole: g.memberships[0]?.role ?? null,
          lastActivityAt: lastMessage?.createdAt ?? null,
          lastMessage: lastMessage ? { senderName: lastMessage.author.displayName, body: lastMessage.body } : null,
          unreadCount: unreadByGroup.get(g.id) ?? 0,
          joinRequestPending: pendingRequestGroupIds.has(g.id),
          isVerified: g.isVerified,
        };
      }),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).optional(),
  visibility: z.enum(["OPEN", "REQUEST_TO_JOIN"]).default("REQUEST_TO_JOIN"),
  postPermission: z.enum(["CREATOR_ONLY", "ADMINS", "ALL_MEMBERS"]).default("ALL_MEMBERS"),
  // Client already uploaded the original to R2 via the "avatar" presign kind
  // (same as /api/groups/[id]/photo) — this finalizes it into the new group's
  // coverImageUrl in the same request, so Create Fanbase doesn't need a
  // create-then-immediately-PATCH round trip.
  coverImageKey: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { coverImageKey, ...body } = createSchema.parse(await req.json());

    let coverImageUrl: string | null = null;
    if (coverImageKey) {
      if (!coverImageKey.startsWith(`avatars/${user.id}/`)) {
        return NextResponse.json({ error: "Key does not belong to this user" }, { status: 403 });
      }
      const original = await getObjectBuffer(coverImageKey);
      const resized = await resizeSquare(original, 512);
      const derivativeKey = `avatars/${user.id}/${randomUUID()}-512.jpg`;
      await putObjectBuffer(derivativeKey, resized, "image/jpeg");
      coverImageUrl = publicUrlFor(derivativeKey);
    }

    const group = await db.$transaction(async (tx) => {
      const created = await tx.fanbaseGroup.create({ data: { creatorId: user.id, ...body, coverImageUrl } });
      // The creator is always a member (as ADMIN) so membership checks don't
      // need a separate "or you're the creator" branch everywhere.
      await tx.membership.create({ data: { groupId: created.id, userId: user.id, role: "ADMIN" } });
      return created;
    });

    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
