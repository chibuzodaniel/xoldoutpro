import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

async function requireAdmin(groupId: string, userId: string) {
  const membership = await db.membership.findUnique({ where: { groupId_userId: { groupId, userId } } });
  return membership?.role === "ADMIN";
}

// PRD §12/§11: "Join requests | Queue for private fanbases." Admin-only —
// same admin set that can moderate the group (creator is always an admin
// member, per POST /api/groups).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    if (!(await requireAdmin(id, user.id))) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

    const requests = await db.joinRequest.findMany({
      where: { groupId: id, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, handle: true, displayName: true, avatarUrl: true } } },
    });
    return NextResponse.json({ requests });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
