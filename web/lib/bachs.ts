// Bachs REST API (https://docs.bachs.io) — third checkout processor, wired
// in while Flutterwave and Monnify's merchant accounts are still pending
// approval (see GatewayPickerSheet.tsx, currently Bachs-only for that
// reason). Same shape as lib/flutterwave.ts / lib/monnify.ts deliberately —
// initialize/verify/refund, "don't trust the webhook body for business
// logic" applies here too (see the webhook route) — with one real
// difference: Bachs's API speaks decimal-string major-unit amounts
// ("75000.00") rather than kobo, converted at the edges here so every caller
// keeps working in amountKobo like the other two processors.
const BASE_URL = process.env.BACHS_BASE_URL || "https://api.bachs.io";

function secretKey() {
  const key = process.env.BACHS_SECRET_KEY;
  if (!key) throw new Error("BACHS_SECRET_KEY is not set. See .env.local.example.");
  return key;
}

async function bachs<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Bachs error (${path}): ${body?.error?.message ?? body?.message ?? res.statusText}`);
  }
  return body;
}

function koboToAmount(amountKobo: number) {
  return (amountKobo / 100).toFixed(2);
}

export async function initializePayment(args: {
  txRef: string;
  amountKobo: number;
  customerEmail: string;
  customerName: string;
  redirectUrl: string;
  title: string;
}) {
  const data = await bachs<{ checkout_url: string }>("/v1/checkout-sessions", {
    method: "POST",
    body: JSON.stringify({
      customer: { email: args.customerEmail, name: args.customerName },
      // "Charge a raw amount" (no pre-created product) — this app's prices
      // are computed at order time (lib/commerce catalog), not a Bachs
      // product catalog.
      pricing: { currency: "NGN", amount: koboToAmount(args.amountKobo) },
      reference: args.txRef,
      // Bachs appends its own `?checkout_id=` on redirect; embedding tx_ref
      // here too keeps /checkout/callback's existing `?tx_ref=` reader
      // (written for Flutterwave/Monnify's own redirect params) working for
      // Bachs unchanged.
      success_url: `${args.redirectUrl}?tx_ref=${encodeURIComponent(args.txRef)}`,
      cancel_url: args.redirectUrl,
      metadata: { title: args.title },
    }),
  });
  return data.checkout_url;
}

export type VerifiedTransaction = {
  id: string; // Bachs's payment_id (charge id) — Payment.providerTransactionId
  txRef: string;
  status: "successful" | "failed" | string;
  amountKobo: number;
  currency: string;
  // Only meaningfully different from amountKobo on an underpaid charge; null
  // when Bachs hasn't recorded any payment against the charge at all.
  amountPaidKobo: number | null;
};

// `accepted` covers an under/overpayment Bachs accepted as final settlement
// (see the payment object's status enum) — still money actually received.
const SUCCESS_STATUSES = new Set(["succeeded", "accepted"]);

/**
 * Authoritative payment check, same role as flutterwave.ts/monnify.ts's
 * verifyTransaction — the webhook body's own claimed amount/status is never
 * trusted, only used to know which charge_id to look up here.
 */
export async function verifyTransaction(chargeId: string): Promise<VerifiedTransaction> {
  const data = await bachs<{
    payment_id: string;
    reference: string | null;
    status: string;
    amount: string;
    amount_paid: string | null;
    currency: string;
  }>(`/v1/payments/${chargeId}`);
  return {
    id: data.payment_id,
    txRef: data.reference ?? "",
    status: SUCCESS_STATUSES.has(data.status) ? "successful" : "failed",
    amountKobo: Math.round(parseFloat(data.amount) * 100),
    amountPaidKobo: data.amount_paid == null ? null : Math.round(parseFloat(data.amount_paid) * 100),
    currency: data.currency,
  };
}

/**
 * Reverses a charge — takes Bachs's own charge id
 * (Payment.providerTransactionId), not our reference. amountKobo required,
 * same reasoning as monnify.ts's initiateRefund: omitting it isn't confirmed
 * to default to a full refund.
 */
export async function initiateRefund(chargeId: string, amountKobo: number) {
  const reference = `refund-${chargeId}-${Date.now()}`;
  const data = await bachs<{ refund_id: string; status: string }>("/v1/refunds", {
    method: "POST",
    body: JSON.stringify({
      charge_id: chargeId,
      reference,
      idempotency_key: reference,
      amount: koboToAmount(amountKobo),
      reason: "Takedown / content removal",
    }),
  });
  return data;
}
