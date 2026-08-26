import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyTransaction } from "@/lib/flutterwave";
import { finalizePayment } from "@/lib/commerce/confirmPayment";

export const runtime = "nodejs";

/**
 * Flutterwave webhooks are neither authenticated by IP nor guaranteed
 * exactly-once (PRD §16: "assume they arrive twice or out of order"). The
 * `verif-hash` header only proves the sender knows our shared secret — it is
 * NOT an HMAC over the body — so the webhook body itself is never trusted
 * for amounts/status. Every field used for business logic comes back from
 * `verifyTransaction`, an authoritative server-to-server call to Flutterwave.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("verif-hash");
  const expected = process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH;
  if (!expected || signature !== expected) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const transactionId = body?.data?.id;
  if (!transactionId) return NextResponse.json({ error: "Missing transaction id" }, { status: 400 });

  let verified;
  try {
    verified = await verifyTransaction(transactionId);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not verify transaction" }, { status: 502 });
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
