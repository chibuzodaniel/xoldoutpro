import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// PRD §11 Phase 2: "the joined-communities list as the tab root." Default
// (no `discover`) returns groups the user is a member of. `?discover=1`
// browses everything, for finding new ones to join. `?q=` filters by name
// for the Fanbase search bar.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const discover = req.nextUrl.searchParams.get("discover") === "1";
    const q = req.nextUrl.searchParams.get("q")?.trim();

    const groups = await db.fanbaseGroup.findMany({
      where: {
        ...(discover ? {} : { memberships: { some: { userId: user.id } } }),
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: { handle: true, displayName: true, isVerified: true } },
        _count: { select: { memberships: true } },
        memberships: { where: { userId: user.id }, select: { role: true } },
      },
      take: 50,
    });

    // "Active Xm ago" (image10 reference) is the most recent message in a
    // group you're actually in — one grouped query rather than N.
    const memberGroupIds = groups.filter((g) => g.memberships.length > 0).map((g) => g.id);
    const lastActivity = memberGroupIds.length
      ? await db.post.groupBy({ by: ["groupId"], where: { groupId: { in: memberGroupIds } }, _max: { createdAt: true } })
      : [];
    const lastActivityByGroup = new Map(lastActivity.map((a) => [a.groupId, a._max.createdAt]));

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
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        coverImageUrl: g.coverImageUrl,
        visibility: g.visibility,
        creatorId: g.creatorId,
        creator: g.creator,
        memberCount: g._count.memberships,
        myRole: g.memberships[0]?.role ?? null,
        lastActivityAt: lastActivityByGroup.get(g.id) ?? null,
        joinRequestPending: pendingRequestGroupIds.has(g.id),
        isVerified: g.isVerified,
      })),
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
  postPermission: z.enum(["CREATOR_ONLY", "ADMINS", "ALL_MEMBERS"]).default("CREATOR_ONLY"),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const body = createSchema.parse(await req.json());

    const group = await db.$transaction(async (tx) => {
      const created = await tx.fanbaseGroup.create({ data: { creatorId: user.id, ...body } });
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
