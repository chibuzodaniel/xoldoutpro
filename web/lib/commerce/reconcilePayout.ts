import { db } from "@/lib/db";
import { getPayout } from "@/lib/bachs";
import { createNotification } from "@/lib/notifications/create";
import type { Payout } from "@/generated/prisma/client";

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

/**
 * Authoritative payout status check + settlement, shared by the Bachs
 * webhook (event-driven) and the wallet GET route (poll-driven fallback) —
 * a payout must resolve out of PROCESSING even if Bachs's webhook delivery
 * to us fails outright, not only when it succeeds. Both callers hit the same
 * updateMany-guarded transitions, so whichever gets there first is a no-op
 * for the other rather than a duplicate notification/ledger entry.
 */
// Throws if the Bachs check itself fails — callers decide what that means
// for them (the webhook surfaces it as a 502 so Bachs retries delivery; the
// wallet route's best-effort poll just logs and moves on).
export async function reconcilePayout(payout: Payout): Promise<void> {
  if (!payout.processorRef) return;
  if (payout.status !== "PENDING" && payout.status !== "PROCESSING") return;

  const verified = await getPayout(payout.processorRef);

  if (verified.status === "completed") {
    const claim = await db.payout.updateMany({ where: { id: payout.id, status: { not: "PAID" } }, data: { status: "PAID" } });
    if (claim.count > 0) {
      await createNotification(payout.userId, {
        kind: "PAYOUT_PAID",
        title: "Withdrawal sent",
        body: `${formatNaira(payout.netKobo)} has been delivered to your bank.`,
        url: "/wallet",
      });
    }
  } else if (verified.status === "failed") {
    const claim = await db.payout.updateMany({ where: { id: payout.id, status: { not: "FAILED" } }, data: { status: "FAILED" } });
    if (claim.count > 0) {
      await db.walletLedgerEntry.create({
        data: { userId: payout.userId, amountKobo: payout.amountKobo, kind: "PAYOUT_DEBIT", status: "AVAILABLE", payoutId: payout.id },
      });
      await createNotification(payout.userId, {
        kind: "PAYOUT_FAILED",
        title: "Withdrawal failed",
        body: `${formatNaira(payout.netKobo)} could not be delivered — your balance has been restored.`,
        url: "/wallet",
      });
    }
  }
}
