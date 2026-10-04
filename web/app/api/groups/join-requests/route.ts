import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Every pending join request across all the private Fanbases this user runs
// (explicit ask, 2026-10-04: tapping "Private Fanbase join requests" or the
// new-request notification should go straight to the pending list). Same
// admin set as /api/groups/[id]/join-requests — approve/reject still go
// through that route's [requestId] PATCH.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const requests = await db.joinRequest.findMany({
      where: {
        status: "PENDING",
        group: { OR: [{ creatorId: user.id }, { memberships: { some: { userId: user.id, role: "ADMIN" } } }] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, handle: true, displayName: true, avatarUrl: true } },
        group: { select: { id: true, name: true, coverImageUrl: true } },
      },
    });
    return NextResponse.json({ requests });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
