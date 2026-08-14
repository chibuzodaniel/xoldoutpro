import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Balance correctness never depends on this running (see getWalletBalances,
 * which compares availableAt directly) — this only keeps the stored
 * `status` column truthful for anything that reads it as a label rather
 * than recomputing. Call from the same external scheduler as sweep-holds.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-internal-secret");
  if (!secret || secret !== process.env.INTERNAL_CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await db.walletLedgerEntry.updateMany({
    where: { status: "PENDING", availableAt: { lte: new Date() } },
    data: { status: "AVAILABLE" },
  });

  return NextResponse.json({ settled: result.count });
}
