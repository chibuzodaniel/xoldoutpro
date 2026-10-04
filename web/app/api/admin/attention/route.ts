import { NextRequest, NextResponse } from "next/server";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { getAttentionCounts, type AttentionPanel } from "@/lib/moderation/attention";
import { canModeratorUse } from "@/lib/moderation/panelAccess";

// Live "needs attention" counts for the moderator board's nav badges
// (components/moderation/ModerationShell.tsx polls this while it's open).
// A panel a super-moderator has turned off for regular moderators reports 0
// to them — its count isn't theirs to see either.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireModerator(req);
    const counts = await getAttentionCounts();
    for (const panel of Object.keys(counts) as AttentionPanel[]) {
      if (!(await canModeratorUse(user, panel))) counts[panel] = 0;
    }
    return NextResponse.json({ counts });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
