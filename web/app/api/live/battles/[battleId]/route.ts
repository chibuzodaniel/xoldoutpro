import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { describeBattle } from "@/lib/live/battle";

// A battle's recorded result — scoreboard, turn times, supporters.
export async function GET(req: NextRequest, { params }: { params: Promise<{ battleId: string }> }) {
  try {
    const { battleId } = await params;
    const viewer = await getOptionalUser(req);
    const battle = await describeBattle(battleId, viewer?.id ?? null);
    if (!battle) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ battle });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
