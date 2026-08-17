import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const productSelect = {
  select: {
    id: true,
    title: true,
    type: true,
    release: { select: { artworkLadder: true } },
    beat: { select: { coverImageLadder: true } },
  },
} as const;

// PRD §10: Library's Gifts tab is "bought but unclaimed, and received."
// "Sent" carries the claim link so the giver can re-share it; "received" is
// mostly a historical view since a claimed gift already shows up in
// Purchased via its Entitlement.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);

    const [sent, received] = await Promise.all([
      db.gift.findMany({
        where: { giverId: user.id },
        orderBy: { createdAt: "desc" },
        include: { product: productSelect, claimedBy: { select: { handle: true, displayName: true } } },
      }),
      db.gift.findMany({
        where: { claimedById: user.id },
        orderBy: { claimedAt: "desc" },
        include: { product: productSelect, giver: { select: { handle: true, displayName: true } } },
      }),
    ]);

    return NextResponse.json({ sent, received });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
