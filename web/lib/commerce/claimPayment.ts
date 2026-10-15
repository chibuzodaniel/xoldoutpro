import { db } from "@/lib/db";
import { initiateRefund as initiateFlutterwaveRefund } from "@/lib/flutterwave";
import { initiateRefund as initiateMonnifyRefund } from "@/lib/monnify";
import { initiateRefund as initiateBachsRefund } from "@/lib/bachs";

type VerifiedResult = { id: number | string; status: "successful" | "failed" | string; amountKobo: number };

export type PaymentClaim = "claimed" | "late" | "alreadyProcessed";

/**
 * Idempotency gate shared by every webhook finalize path: only the delivery
 * that wins a conditional update proceeds, every retry/duplicate after that
 * sees count 0 and no-ops.
 *
 * "late" (fixed 2026-10-15): app/api/internal/sweep-holds times an unpaid
 * checkout out as FAILED after ~10 minutes, but the processor's own checkout
 * page has no matching expiry — a buyer who pays after that (easy with a
 * bank transfer) used to have their success webhook silently dropped here,
 * since the row was no longer INITIATED: charged, nothing delivered, nothing
 * logged. A sweep-failed row is told apart from a processor-reported failure
 * by webhookReceivedAt still being null (the sweep never sets it), and only
 * a *successful* late result is accepted — a late failure has nothing to
 * undo. The caller has to re-take whatever the sweep released (stock hold,
 * billboard slot) before treating it as a normal success.
 */
export async function claimPaymentForWebhook(paymentId: string, verified: VerifiedResult, rawPayload: unknown): Promise<PaymentClaim> {
  const data = {
    status: verified.status === "successful" ? ("SUCCESSFUL" as const) : ("FAILED" as const),
    webhookReceivedAt: new Date(),
    rawPayload: rawPayload as never,
    providerTransactionId: String(verified.id),
  };

  const claim = await db.payment.updateMany({ where: { id: paymentId, status: "INITIATED" }, data });
  if (claim.count > 0) return "claimed";

  if (verified.status !== "successful") return "alreadyProcessed";
  const late = await db.payment.updateMany({ where: { id: paymentId, status: "FAILED", webhookReceivedAt: null }, data });
  if (late.count === 0) return "alreadyProcessed";

  console.error(`Late payment success on payment ${paymentId} (charge ${verified.id}) — arrived after the hold sweep had already failed it; recovering.`);
  return "late";
}

/**
 * True when the processor permanently refuses to reverse this charge (seen
 * from Bachs on real charges: "Refunds are not supported for this charge") —
 * as opposed to a transient failure worth retrying. Callers fall back to
 * creditRefundToWallet for these.
 */
export function isRefundUnsupported(err: unknown) {
  return err instanceof Error && /not supported/i.test(err.message);
}

/**
 * Pays a refund into the buyer's xoldOut wallet instead of back to their
 * card/bank (explicit choice, 2026-10-15, for charges the processor won't
 * refund). Immediately AVAILABLE — it's the buyer's own money coming back,
 * not sale earnings with a settlement window.
 */
export async function creditRefundToWallet(args: { userId: string; orderId: string; amountKobo: number }) {
  await db.walletLedgerEntry.create({
    data: { userId: args.userId, orderId: args.orderId, amountKobo: args.amountKobo, kind: "REFUND_CREDIT", status: "AVAILABLE", availableAt: null },
  });
}

/** Sends a full refund back through whichever processor took the charge. */
export async function refundCharge(processor: string, chargeId: string, amountKobo: number) {
  if (processor === "monnify") return initiateMonnifyRefund(chargeId, amountKobo);
  if (processor === "bachs") return initiateBachsRefund(chargeId, amountKobo);
  return initiateFlutterwaveRefund(chargeId, amountKobo);
}
