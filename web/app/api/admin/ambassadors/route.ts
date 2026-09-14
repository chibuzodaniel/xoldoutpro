import { NextRequest, NextResponse } from "next/server";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  getAmbassadorRevenueGeneratedKobo,
  getAmbassadorActiveInviteCount,
  getAmbassadorTierRates,
  getWalletBalances,
} from "@/lib/commerce/ledger";
import { ambassadorTierFor } from "@/lib/commerce/constants";

export async function GET(req: NextRequest) {
  try {
    await requireModerator(req);

    const [pendingApplications, ambassadors] = await Promise.all([
      db.ambassadorApplication.findMany({
        where: { status: "PENDING" },
        include: { user: { select: { handle: true, displayName: true } } },
        orderBy: { createdAt: "asc" },
      }),
      db.user.findMany({
        where: { isAmbassador: true },
        select: { id: true, handle: true, displayName: true, ambassadorCode: true },
        orderBy: { displayName: "asc" },
      }),
    ]);

    const ambassadorRows = await Promise.all(
      ambassadors.map(async (a) => {
        const [referredCount, revenueGeneratedKobo, activeInviteCount, { availableKobo }] = await Promise.all([
          db.user.count({ where: { referredByAmbassadorId: a.id } }),
          getAmbassadorRevenueGeneratedKobo(db, a.id),
          getAmbassadorActiveInviteCount(db, a.id),
          getWalletBalances(a.id),
        ]);
        const tier = ambassadorTierFor(activeInviteCount);
        const rates = await getAmbassadorTierRates(db, tier);
        return {
          id: a.id,
          handle: a.handle,
          displayName: a.displayName,
          referredCount,
          activeInviteCount,
          revenueGeneratedKobo,
          tier,
          firstPurchasePercent: rates.firstPurchasePercent,
          continuousPercent: rates.continuousPercent,
          walletAvailableKobo: availableKobo,
        };
      }),
    );

    return NextResponse.json({ pendingApplications, ambassadors: ambassadorRows });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
