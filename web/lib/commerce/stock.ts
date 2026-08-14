import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// The hardest correctness problem in the MVP (PRD §16): never oversell the
// last unit under concurrent buyers. A single UPDATE...WHERE...RETURNING
// takes Postgres's own row lock — no explicit locking or transaction
// isolation tuning needed. Two concurrent reserveStock() calls against the
// same row serialize at the database level; only one can see reserved+sold
// still under cap and win the RETURNING row.
//
// Each function takes an optional client so confirmStock/releaseReservation
// can be run inside the same $transaction as the Order/Entitlement/Ledger
// writes they must be atomic with (the webhook handler does this); reserveStock
// stands alone at checkout time, before any of that exists yet.
type DbClient = typeof db | Prisma.TransactionClient;

export type ReserveResult = { ok: true } | { ok: false; reason: "SOLD_OUT" };

/** Called at checkout initiation, before payment. Reversed by releaseReservation on failure/timeout. */
export async function reserveStock(productId: string, client: DbClient = db): Promise<ReserveResult> {
  const rows = await client.$queryRaw<{ productId: string }[]>`
    UPDATE "StockPolicy"
    SET "reserved" = "reserved" + 1
    WHERE "productId" = ${productId} AND ("cap" IS NULL OR "sold" + "reserved" < "cap")
    RETURNING "productId"
  `;
  return rows.length > 0 ? { ok: true } : { ok: false, reason: "SOLD_OUT" };
}

/** Called from the payment-success webhook. Converts a reservation into a sale. */
export async function confirmStock(productId: string, client: DbClient = db): Promise<void> {
  await client.$executeRaw`
    UPDATE "StockPolicy"
    SET "sold" = "sold" + 1,
        "reserved" = GREATEST("reserved" - 1, 0),
        "soldOutAt" = CASE WHEN "cap" IS NOT NULL AND "sold" + 1 >= "cap" THEN now() ELSE "soldOutAt" END
    WHERE "productId" = ${productId}
  `;
}

/** Called on payment failure, or by the expiry sweep for abandoned checkouts (~10min hold). */
export async function releaseReservation(productId: string, client: DbClient = db): Promise<void> {
  await client.$executeRaw`
    UPDATE "StockPolicy" SET "reserved" = GREATEST("reserved" - 1, 0) WHERE "productId" = ${productId}
  `;
}
