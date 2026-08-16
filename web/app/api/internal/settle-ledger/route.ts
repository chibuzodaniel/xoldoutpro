import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Balance correctness never depends on this running (see getWalletBalances,
 * which compares availableAt directly) — this only keeps the stored
 * `status` column truthful for anything that reads it as a label rather
 * than recomputing. Triggered by the same vercel.json cron mechanism as
 * sweep-holds (GET + CRON_SECRET bearer auth) — see that route's comment
 * for the Hobby-plan once/day frequency caveat, which matters far less
 * here since nothing depends on this being fresh.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await db.walletLedgerEntry.updateMany({
    where: { status: "PENDING", availableAt: { lte: new Date() } },
    data: { status: "AVAILABLE" },
  });

  return NextResponse.json({ settled: result.count });
}
