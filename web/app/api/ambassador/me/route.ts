import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  getAmbassadorRevenueGeneratedKobo,
  getAmbassadorTierRatePercent,
} from "@/lib/commerce/ledger";
import { ambassadorTierFor, nextAmbassadorTier, AMBASSADOR_TIER_THRESHOLDS_KOBO } from "@/lib/commerce/constants";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);

    const latestApplication = await db.ambassadorApplication.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    if (!user.isAmbassador) {
      return NextResponse.json({ isAmbassador: false, application: latestApplication });
    }

    const [referredCount, revenueGeneratedKobo] = await Promise.all([
      db.user.count({ where: { referredByAmbassadorId: user.id } }),
      getAmbassadorRevenueGeneratedKobo(db, user.id),
    ]);

    const tier = ambassadorTierFor(revenueGeneratedKobo);
    const commissionPercent = await getAmbassadorTierRatePercent(db, tier);
    const next = nextAmbassadorTier(tier);
    const nextTier = next
      ? {
          name: next,
          remainingKobo: AMBASSADOR_TIER_THRESHOLDS_KOBO[next] - revenueGeneratedKobo,
          commissionPercent: await getAmbassadorTierRatePercent(db, next),
        }
      : null;

    return NextResponse.json({
      isAmbassador: true,
      ambassadorCode: user.ambassadorCode,
      referredCount,
      revenueGeneratedKobo,
      tier,
      commissionPercent,
      nextTier,
      application: latestApplication,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
