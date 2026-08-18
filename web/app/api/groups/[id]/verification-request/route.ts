import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Self-serve "apply for verification" — the creator can request it, but only
// a moderator's POST /api/admin/verify-group actually flips isVerified. No
// evidence/criteria workflow (PRD §18 gap, same as User verification).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const group = await db.fanbaseGroup.findUnique({ where: { id } });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (group.creatorId !== user.id) {
      return NextResponse.json({ error: "Only the creator can request verification" }, { status: 403 });
    }
    if (group.isVerified) return NextResponse.json({ error: "Already verified" }, { status: 400 });
    if (group.verificationRequestedAt) {
      return NextResponse.json({ verificationRequestedAt: group.verificationRequestedAt });
    }

    const updated = await db.fanbaseGroup.update({
      where: { id },
      data: { verificationRequestedAt: new Date() },
    });
    return NextResponse.json({ verificationRequestedAt: updated.verificationRequestedAt });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
