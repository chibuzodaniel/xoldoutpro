// Bachs REST API (https://docs.bachs.io) — third checkout processor, wired
// in while Flutterwave and Monnify's merchant accounts are still pending
// approval (see GatewayPickerSheet.tsx, currently Bachs-only for that
// reason), and now also this app's payout processor (see the Payouts
// section below), replacing lib/flutterwave.ts's transfer functions.
// Checkout/refunds mirror flutterwave.ts/monnify.ts's shape deliberately —
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

// ─── Payouts (creator withdrawals — replaces lib/flutterwave.ts's transfer
// functions) ─────────────────────────────────────────────────────────────
//
// Bachs's payout model differs from Flutterwave's in one structural way
// that matters here: Flutterwave's initiateTransfer takes raw bank details
// on every call, but Bachs requires registering a "payout destination" once
// (POST /v1/payouts/destinations) and paying out to its id thereafter — so
// PayoutAccount needs to store that id (see prisma/schema.prisma's
// `payoutDestinationId`/`payoutDestinationUsable`). Existing PayoutAccount
// rows added under the old Flutterwave flow have neither, and withdraw will
// reject them until the creator re-adds the bank account (see the wallet
// routes).
//
// Requires the `payouts:read`/`payouts:write` API key scopes — Bachs lists
// Payouts as "Limited Access": contact hello@bachs.io if the key 403s with
// "missing required scope."

export async function getNigerianBanks() {
  const data = await bachs<{ banks: { code: string; name: string }[] }>("/v1/payouts/banks");
  return data.banks.map((b) => ({ code: b.code, name: b.name }));
}

/**
 * Same role as flutterwave.ts's resolveAccount: confirms the account name
 * before it's trusted (PRD §13). Bachs's own docs describe this endpoint
 * returning a wrapped `{ status, message, data, error }` envelope, but a
 * real call against the live API (checked directly, not assumed from the
 * docs) returns the resolved fields flat, matching the rest of this API —
 * shaped that way here, not per the docs.
 */
export async function resolveAccount(accountNumber: string, bankCode: string) {
  const data = await bachs<{ account_number: string; account_name: string }>("/v1/payouts/resolve-account", {
    method: "POST",
    body: JSON.stringify({ account_number: accountNumber, bank_code: bankCode }),
  });
  return { accountNumber: data.account_number, accountName: data.account_name };
}

export type PayoutDestination = { id: string; isUsable: boolean };

/**
 * Registers a bank account as a place Bachs can send money — a step
 * Flutterwave's flat per-call transfer API doesn't have. Called once, right
 * after resolveAccount, when a creator adds a payout account; its `id` is
 * what initiatePayout pays out to from then on.
 *
 * Per Bachs's docs, a Nigerian bank account that resolved successfully
 * (which this always has, by the time it's called — resolveAccount already
 * ran) clears review automatically, so `isUsable` should read `true`
 * immediately in the normal case. It's still surfaced rather than assumed,
 * since an unresolvable/edge-case account can land in manual review instead.
 */
export async function createPayoutDestination(args: { accountNumber: string; bankCode: string; label: string }) {
  const data = await bachs<{ id: string; is_usable: boolean }>("/v1/payouts/destinations", {
    method: "POST",
    body: JSON.stringify({
      name: args.label,
      currency: "NGN",
      type: "bank_account",
      account_number: args.accountNumber,
      bank_code: args.bankCode,
    }),
  });
  return { id: data.id, isUsable: data.is_usable };
}

/**
 * Pays out to an already-registered destination (PayoutAccount.payoutDestinationId)
 * — takes that id, not raw bank details, unlike flutterwave.ts's
 * initiateTransfer. `amount` is what the destination receives; Bachs charges
 * its fee on top, debited from the platform's own balance, which is what
 * keeps "platform absorbs the withdrawal fee" (DECISIONS.md) true here
 * without this app doing any fee math of its own.
 */
export async function initiatePayout(args: { destinationId: string; amountKobo: number; reference: string }) {
  const data = await bachs<{ id: string; status: string }>("/v1/payouts", {
    method: "POST",
    headers: { "Idempotency-Key": args.reference },
    body: JSON.stringify({
      destination: args.destinationId,
      amount: koboToAmount(args.amountKobo),
      reference: args.reference,
    }),
  });
  return data;
}
