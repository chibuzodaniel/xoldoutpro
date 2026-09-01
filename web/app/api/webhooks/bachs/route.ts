import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyTransaction } from "@/lib/bachs";
import { finalizePayment } from "@/lib/commerce/confirmPayment";
import { reconcilePayout } from "@/lib/commerce/reconcilePayout";

export const runtime = "nodejs";

const TOLERANCE_SECONDS = 300;

// The only events this endpoint is subscribed to; anything else (e.g. a
// future event type added to the same endpoint) is acknowledged and ignored
// rather than erroring.
const COLLECTION_EVENT_TYPES = new Set(["collection.succeeded", "collection.failed", "collection.underpaid"]);
// payout.created isn't subscribed to — the withdraw route already sets
// PROCESSING synchronously when it initiates the payout, so that event tells
// us nothing new. These two are the ones that previously had no handler at
// all: Payout.status had no path that ever became PAID, and a payout that
// failed *after* Bachs accepted it (bad account, bank-side rejection —
// distinct from the withdraw route's own initiate-failure catch, which only
// covers a payout Bachs rejected immediately) never reversed the creator's
// debit, silently losing their money.
const PAYOUT_EVENT_TYPES = new Set(["payout.paid", "payout.failed"]);

/**
 * Same trust model as the Flutterwave/Monnify webhooks (PRD §16): Bachs
 * signs every delivery with `X-Bachs-Signature` — an HMAC-SHA256 hex digest
 * of `"{timestamp}.{raw_body}"` using the endpoint's signing secret — which
 * is checked here, but the body's own claimed amount/status still isn't
 * trusted for business logic. Every field used for business logic comes
 * back from verifyTransaction, an authoritative server-to-server call to
 * Bachs. The timestamp is also checked against a 5-minute tolerance, per
 * Bachs's own reference implementation, to reject replayed deliveries.
 */
function isValidSignature(rawBody: string, timestampHeader: string | null, signatureHeader: string | null) {
  const secret = process.env.BACHS_WEBHOOK_SECRET;
  if (!secret || !timestampHeader || !signatureHeader) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  if (expected.length !== signatureHeader.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("X-Bachs-Timestamp");
  const signature = req.headers.get("X-Bachs-Signature");
  if (!isValidSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);

  if (PAYOUT_EVENT_TYPES.has(body?.type)) {
    return handlePayoutEvent(body);
  }

  if (!COLLECTION_EVENT_TYPES.has(body?.type)) {
    return NextResponse.json({ ok: true });
  }

  // Per Bachs's docs, charge_id can be null on collection.succeeded (test
  // webhooks, legacy payments, manual reconciliation) — nothing to verify
  // against then.
  const chargeId = body?.data?.charge_id;
  if (!chargeId) return NextResponse.json({ error: "Missing charge id" }, { status: 400 });

  let verified;
  try {
    verified = await verifyTransaction(chargeId);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not verify transaction" }, { status: 502 });
  }

  // An underpaid charge resolves to "failed" below (verifyTransaction's
  // status isn't in SUCCESS_STATUSES), same order-failure path as any other
  // decline. The difference: Bachs actually holds part of the buyer's money
  // here, which a plain decline never leaves behind — flagged loudly so it
  // gets reconciled (refund the partial amount, or request the balance)
  // instead of quietly vanishing into a FAILED order.
  if (body.type === "collection.underpaid") {
    console.error(
      `Bachs underpayment on charge ${chargeId} (order ${verified.txRef}): ` +
        `paid ${verified.amountPaidKobo ?? "?"} of ${verified.amountKobo} kobo. ` +
        `Funds are held at Bachs — reconcile manually (refund or request the balance).`,
    );
  }

  const payment = await db.payment.findUnique({
    where: { processorRef: verified.txRef },
    include: { order: { include: { items: true } } },
  });
  if (!payment) return NextResponse.json({ error: "Unknown order" }, { status: 404 });

  try {
    await finalizePayment(payment, verified, body);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not finalize order" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * payout.paid / payout.failed. Matched by `data.reference` — the withdraw
 * route passes our own `Payout.id` as Bachs's `reference` when it initiates
 * the payout — falling back to `data.withdrawal_id` (stored as
 * `Payout.processorRef`) for the rare case reference came back null. Like
 * the collection handler above, the webhook body only identifies which
 * payout to check; reconcilePayout() re-derives the authoritative status
 * from Bachs directly rather than trusting the event body.
 */
async function handlePayoutEvent(body: { type: string; data?: { withdrawal_id?: string; reference?: string } }) {
  const withdrawalId = body.data?.withdrawal_id;
  const reference = body.data?.reference;
  if (!withdrawalId && !reference) {
    return NextResponse.json({ error: "Missing withdrawal id and reference" }, { status: 400 });
  }

  const payout = await db.payout.findFirst({
    where: reference ? { id: reference } : { processorRef: withdrawalId },
  });
  if (!payout) return NextResponse.json({ error: "Unknown payout" }, { status: 404 });

  try {
    await reconcilePayout(payout);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not verify payout" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
