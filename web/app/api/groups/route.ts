import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// PRD §11 Phase 2: "the joined-communities list as the tab root." Default
// (no `discover`) returns groups the user is a member of. `?discover=1`
// browses everything, for finding new ones to join.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const discover = req.nextUrl.searchParams.get("discover") === "1";

    const groups = await db.fanbaseGroup.findMany({
      where: discover ? {} : { memberships: { some: { userId: user.id } } },
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: { handle: true, displayName: true } },
        _count: { select: { memberships: true } },
        memberships: { where: { userId: user.id }, select: { role: true } },
      },
      take: 50,
    });

    return NextResponse.json({
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        coverImageUrl: g.coverImageUrl,
        visibility: g.visibility,
        creator: g.creator,
        memberCount: g._count.memberships,
        myRole: g.memberships[0]?.role ?? null,
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
