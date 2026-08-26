import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyTransaction } from "@/lib/monnify";
import { finalizePayment } from "@/lib/commerce/confirmPayment";

export const runtime = "nodejs";

function isValidSignature(rawBody: string, signature: string | null) {
  const secret = process.env.MONNIFY_SECRET_KEY;
  if (!secret || !signature) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  // Lengths always match (both are hex-encoded SHA-512), but timingSafeEqual
  // throws on a length mismatch rather than returning false — guard first.
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/**
 * Same trust model as the Flutterwave webhook (PRD §16): Monnify's
 * `monnify-signature` header is an HMAC-SHA512 of the raw request body
 * using our secret key — that's checked here, but the body's own claimed
 * amount/status still isn't trusted for business logic. Every field used
 * for business logic comes back from verifyTransaction, an authoritative
 * server-to-server call to Monnify.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("monnify-signature");
  if (!isValidSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const transactionReference = body?.eventData?.transactionReference;
  if (!transactionReference) return NextResponse.json({ error: "Missing transaction reference" }, { status: 400 });

  let verified;
  try {
    verified = await verifyTransaction(transactionReference);
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
