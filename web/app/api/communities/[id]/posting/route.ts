import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { timelineViewer } from "@/lib/communities/timeline";
import { POSTING_MODES } from "@/lib/communities/timelineRules";

// Member Posting Permissions (explicit ask, 2026-11-11): Open, Approval
// Required or Admin Only. Any admin can read and change it, any time.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const v = await timelineViewer(id, user.id);
    if (!v || !v.isAdmin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const pending = await db.post.count({ where: { groupId: id, status: "PENDING" } });
    return NextResponse.json({ mode: v.mode, pending });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const schema = z.object({ mode: z.enum(POSTING_MODES) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { mode } = schema.parse(await req.json());
    const v = await timelineViewer(id, user.id);
    if (!v || !v.isAdmin) return NextResponse.json({ error: "Only admins can change this" }, { status: 403 });
    await db.fanbaseGroup.update({ where: { id }, data: { postingMode: mode } });
    return NextResponse.json({ mode });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Pick a posting option" }, { status: 400 });
    throw err;
  }
}
