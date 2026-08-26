// Monnify's REST API — second checkout processor alongside Flutterwave
// (lib/flutterwave.ts), buyer-selectable at checkout. Same shape as that
// file deliberately, so the two are easy to read side by side: initialize/
// verify/refund, amounts in the major unit (Naira), "don't trust the
// webhook body for business logic" applies here too (see the webhook route).
const BASE_URL = process.env.MONNIFY_BASE_URL || "https://api.monnify.com";

function apiKey() {
  const key = process.env.MONNIFY_API_KEY;
  if (!key) throw new Error("MONNIFY_API_KEY is not set. See .env.local.example.");
  return key;
}

function secretKey() {
  const key = process.env.MONNIFY_SECRET_KEY;
  if (!key) throw new Error("MONNIFY_SECRET_KEY is not set. See .env.local.example.");
  return key;
}

function contractCode() {
  const code = process.env.MONNIFY_CONTRACT_CODE;
  if (!code) throw new Error("MONNIFY_CONTRACT_CODE is not set. See .env.local.example.");
  return code;
}

// Monnify's access token is short-lived (~1hr) and meant to be reused across
// requests, not fetched per-call — cached in module scope with a 60s safety
// margin before expiry. Fine for a single Node server process (Vercel
// functions are short-lived anyway, so this mostly saves calls within one
// invocation handling multiple payments back to back).
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const credentials = Buffer.from(`${apiKey()}:${secretKey()}`).toString("base64");
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}` },
  });
  const body = await res.json();
  if (!res.ok || !body.requestSuccessful) {
    throw new Error(`Monnify auth error: ${body.responseMessage ?? res.statusText}`);
  }

  const token = body.responseBody.accessToken as string;
  const expiresInSec = (body.responseBody.expiresIn as number) ?? 3600;
  cachedToken = { token, expiresAt: Date.now() + (expiresInSec - 60) * 1000 };
  return token;
}

async function mf<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = await res.json();
  if (!res.ok || !body.requestSuccessful) {
    throw new Error(`Monnify error (${path}): ${body.responseMessage ?? res.statusText}`);
  }
  return body;
}

export async function initializePayment(args: {
  txRef: string;
  amountKobo: number;
  customerEmail: string;
  customerName: string;
  redirectUrl: string;
  title: string;
}) {
  const data = await mf<{ responseBody: { checkoutUrl: string } }>("/api/v1/merchant/transactions/init-transaction", {
    method: "POST",
    body: JSON.stringify({
      amount: args.amountKobo / 100, // Monnify amount is in the major unit (Naira), like Flutterwave
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      paymentReference: args.txRef,
      paymentDescription: args.title,
      currencyCode: "NGN",
      contractCode: contractCode(),
      redirectUrl: args.redirectUrl,
      paymentMethods: ["CARD", "ACCOUNT_TRANSFER"],
    }),
  });
  return data.responseBody.checkoutUrl;
}

export type VerifiedTransaction = {
  id: string; // transactionReference — Monnify's own id, not our paymentReference
  txRef: string;
  status: "successful" | "failed" | string;
  amountKobo: number;
  currency: string;
};

const SUCCESS_STATUSES = new Set(["PAID", "OVERPAID"]);

/**
 * Authoritative payment check, same role as flutterwave.ts's
 * verifyTransaction — the webhook body is never trusted for amounts/status,
 * only used to know which transactionReference to look up here.
 */
export async function verifyTransaction(transactionReference: string): Promise<VerifiedTransaction> {
  const data = await mf<{
    responseBody: {
      transactionReference: string;
      paymentReference: string;
      amountPaid: number;
      paymentStatus: string;
      currencyCode: string;
    };
  }>(`/api/v2/transactions/${transactionReference}`);
  return {
    id: data.responseBody.transactionReference,
    txRef: data.responseBody.paymentReference,
    status: SUCCESS_STATUSES.has(data.responseBody.paymentStatus) ? "successful" : "failed",
    amountKobo: Math.round(data.responseBody.amountPaid * 100),
    currency: data.responseBody.currencyCode,
  };
}

/**
 * Reverses a charge — takes Monnify's own transactionReference
 * (Payment.providerTransactionId), not our paymentReference. Unlike
 * flutterwave.ts's initiateRefund, amountKobo is required here: Monnify's
 * refund API isn't confirmed to default to a full refund when the amount is
 * omitted, so every caller (currently just the takedown flow, which always
 * has payment.amountKobo on hand) passes it explicitly.
 */
export async function initiateRefund(transactionReference: string, amountKobo: number) {
  const data = await mf<{ responseBody: { refundReference: string; status: string } }>("/api/v1/refunds/initiate-refund", {
    method: "POST",
    body: JSON.stringify({
      transactionReference,
      refundReference: `refund-${transactionReference}-${Date.now()}`,
      refundReason: "Takedown / content removal",
      refundAmount: amountKobo / 100,
    }),
  });
  return data.responseBody;
}
