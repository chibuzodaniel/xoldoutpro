const BASE_URL = "https://api.flutterwave.com/v3";

function secretKey() {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) throw new Error("FLUTTERWAVE_SECRET_KEY is not set. See .env.local.example.");
  return key;
}

async function fw<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = await res.json();
  if (!res.ok || body.status === "error") {
    throw new Error(`Flutterwave error (${path}): ${body.message ?? res.statusText}`);
  }
  return body;
}

export async function initializePayment(args: {
  txRef: string;
  amountKobo: number;
  customerEmail: string;
  redirectUrl: string;
  title: string;
}) {
  const data = await fw<{ data: { link: string } }>("/payments", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: args.txRef,
      amount: (args.amountKobo / 100).toFixed(2), // Flutterwave amount is in the major unit (Naira)
      currency: "NGN",
      redirect_url: args.redirectUrl,
      customer: { email: args.customerEmail },
      payment_options: "card,banktransfer,ussd",
      customizations: { title: args.title },
    }),
  });
  return data.data.link;
}

export type VerifiedTransaction = {
  id: number;
  txRef: string;
  status: "successful" | "failed" | string;
  amountKobo: number;
  currency: string;
};

/**
 * Authoritative payment check. The webhook body itself is not trusted for
 * business logic — only its `verif-hash` header (checked by the caller) and
 * the transaction id are used to look this up from Flutterwave directly.
 */
export async function verifyTransaction(transactionId: number | string): Promise<VerifiedTransaction> {
  const data = await fw<{
    data: { id: number; tx_ref: string; status: string; amount: number; currency: string };
  }>(`/transactions/${transactionId}/verify`);
  return {
    id: data.data.id,
    txRef: data.data.tx_ref,
    status: data.data.status,
    amountKobo: Math.round(data.data.amount * 100),
    currency: data.data.currency,
  };
}

/**
 * Reverses a charge at the processor — takes Flutterwave's own numeric
 * transaction id (Payment.providerTransactionId), not our tx_ref. Omitting
 * `amountKobo` refunds the full amount, which is all the takedown flow
 * needs; partial refunds aren't used anywhere yet.
 */
export async function initiateRefund(transactionId: string, amountKobo?: number) {
  const data = await fw<{ data: { id: number; status: string } }>(`/transactions/${transactionId}/refund`, {
    method: "POST",
    body: JSON.stringify(amountKobo ? { amount: (amountKobo / 100).toFixed(2) } : {}),
  });
  return data.data;
}

export async function getNigerianBanks() {
  const data = await fw<{ data: { id: number; code: string; name: string }[] }>("/banks/NG");
  return data.data.map((b) => ({ code: b.code, name: b.name }));
}

export async function resolveAccount(accountNumber: string, bankCode: string) {
  const data = await fw<{ data: { account_number: string; account_name: string } }>("/accounts/resolve", {
    method: "POST",
    body: JSON.stringify({ account_number: accountNumber, account_bank: bankCode }),
  });
  return { accountNumber: data.data.account_number, accountName: data.data.account_name };
}

export async function initiateTransfer(args: {
  reference: string;
  accountNumber: string;
  bankCode: string;
  amountKobo: number;
  narration: string;
}) {
  const data = await fw<{ data: { id: number; status: string } }>("/transfers", {
    method: "POST",
    body: JSON.stringify({
      reference: args.reference,
      account_bank: args.bankCode,
      account_number: args.accountNumber,
      amount: args.amountKobo / 100,
      currency: "NGN",
      narration: args.narration,
    }),
  });
  return data.data;
}
