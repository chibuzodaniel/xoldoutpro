import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, getOptionalUser, AuthError } from "@/lib/auth/session";
import {
  BattleError,
  castVote,
  cancelBattle,
  createBattle,
  endTurn,
  finishVoting,
  getLiveBattle,
  listBattles,
  openVoting,
  startBattle,
  startTurn,
} from "@/lib/live/battle";
import { InsufficientCoinsError } from "@/lib/live/coins";

// One Live's battle (lib/live/battle.ts). Clients read this once on open and
// again only when a "battle" live-event arrives — never on a timer (Vercel
// CPU budget, see CLAUDE.md).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const viewer = await getOptionalUser(req);
    const [battle, past] = await Promise.all([getLiveBattle(id, viewer?.id ?? null), listBattles(id)]);
    return NextResponse.json({ battle, past });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    title: z.string().max(80).default(""),
    competitorIds: z.array(z.string().min(1)).min(2).max(4),
    rounds: z.number().int(),
    turnSeconds: z.number().int(),
    votingSeconds: z.number().int(),
    prizePlaces: z.array(z.number().int().min(0).max(1_000_000)).max(3).default([]),
  }),
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("next-turn") }),
  z.object({ action: z.literal("end-turn") }),
  z.object({ action: z.literal("open-voting") }),
  z.object({ action: z.literal("finish") }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("vote"), competitorId: z.string().min(1) }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const body = bodySchema.parse(await req.json());
    switch (body.action) {
      case "create":
        await createBattle(id, user.id, body);
        break;
      case "start":
        await startBattle(id, user.id);
        break;
      case "next-turn":
        await startTurn(id, user.id);
        break;
      case "end-turn":
        await endTurn(id, user.id);
        break;
      case "open-voting":
        await openVoting(id, user.id);
        break;
      case "finish":
        await finishVoting(id, user.id);
        break;
      case "cancel":
        await cancelBattle(id, user.id);
        break;
      case "vote":
        await castVote(id, user.id, body.competitorId);
        break;
    }
    return NextResponse.json({ battle: await getLiveBattle(id, user.id) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Check the battle settings" }, { status: 400 });
    if (err instanceof BattleError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof InsufficientCoinsError) {
      return NextResponse.json({ error: "You don't have enough XG for that prize", insufficientXg: true }, { status: 402 });
    }
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
