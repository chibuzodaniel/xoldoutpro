import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Any member can see the roster (admin list is public within the group,
// PRD §11's "admin list" setting). Non-members get 403.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const membership = await db.membership.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } });
    if (!membership) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

    const members = await db.membership.findMany({
      where: { groupId: id },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      include: { user: { select: { id: true, handle: true, displayName: true, avatarUrl: true } } },
    });
    return NextResponse.json({ members });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
