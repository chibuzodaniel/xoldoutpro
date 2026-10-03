import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Lifetime "Earnings from gifts" (write-up mockup, Socials > Go Live tab) —
// summed straight from LiveGift.xgAmount (the raw XG sent), not derived
// from WalletLedgerEntry's Naira-converted LIVE_GIFT_CREDIT rows, since the
// mockup shows this figure in XG, not Naira. Real withdrawable earnings
// still live only on the wallet page, in Naira, via that ledger.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const gifts = await db.liveGift.aggregate({
      where: { liveSession: { creatorId: user.id } },
      _sum: { xgAmount: true },
      _count: true,
    });
    return NextResponse.json({ giftsXg: gifts._sum.xgAmount ?? 0, giftsCount: gifts._count });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
