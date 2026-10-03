import { NextRequest, NextResponse } from "next/server";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { getAttentionCounts } from "@/lib/moderation/attention";

// Live "needs attention" counts for the moderator board's nav badges
// (components/moderation/ModerationShell.tsx polls this while it's open).
export async function GET(req: NextRequest) {
  try {
    await requireModerator(req);
    return NextResponse.json({ counts: await getAttentionCounts() });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
