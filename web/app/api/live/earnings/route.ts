import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getLiveXgStats, getXgEarningsSummary, getXgPayoutHistory, topGifterAcross } from "@/lib/live/xgEarnings";

// The creator's half of the XG balance page (web /live/coins, mobile LiveCoinsScreen)
// plus the small "Earnings from gifts" figure on LiveNowPanel. giftsXg /
// giftsCount stay as lifetime raw XG received from gifts (what that panel
// shows); everything else is the earned-XG balance waiting for the next
// monthly conversion, per-Live stats, and past conversions — see
// lib/live/xgEarnings.ts.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const [gifts, balance, lives, conversions] = await Promise.all([
      db.liveGift.aggregate({
        where: { liveSession: { creatorId: user.id } },
        _sum: { xgAmount: true },
        _count: true,
      }),
      getXgEarningsSummary(user.id),
      getLiveXgStats(user.id),
      getXgPayoutHistory(user.id),
    ]);
    return NextResponse.json({
      giftsXg: gifts._sum.xgAmount ?? 0,
      giftsCount: gifts._count,
      ...balance,
      lives,
      topGifter: topGifterAcross(lives),
      conversions,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
