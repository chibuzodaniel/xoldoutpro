import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { BattleError, listInvitable } from "@/lib/live/battle";

// Host only: mutual followers they can invite into a battle (lib/live/battle.ts).
// Read when the setup sheet opens, and again (debounced) as the host searches (?q=).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    return NextResponse.json(await listInvitable(id, user.id, req.nextUrl.searchParams.get("q") ?? undefined));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BattleError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
