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

/**
 * Called at checkout initiation, before payment. Reversed by releaseReservation
 * on failure/timeout. `quantity` (ticket/merch group buys) is all-or-nothing —
 * the WHERE clause checks the *whole* quantity fits under cap in the same
 * atomic UPDATE, so a request for 3 against 1 remaining unit reserves zero,
 * never a partial 1.
 */
export async function reserveStock(productId: string, quantity = 1, client: DbClient = db): Promise<ReserveResult> {
  const rows = await client.$queryRaw<{ productId: string }[]>`
    UPDATE "StockPolicy"
    SET "reserved" = "reserved" + ${quantity}
    WHERE "productId" = ${productId} AND ("cap" IS NULL OR "sold" + "reserved" + ${quantity} <= "cap")
    RETURNING "productId"
  `;
  return rows.length > 0 ? { ok: true } : { ok: false, reason: "SOLD_OUT" };
}

/** Called from the payment-success webhook. Converts a reservation into a sale. */
export async function confirmStock(productId: string, quantity = 1, client: DbClient = db): Promise<void> {
  await client.$executeRaw`
    UPDATE "StockPolicy"
    SET "sold" = "sold" + ${quantity},
        "reserved" = GREATEST("reserved" - ${quantity}, 0),
        "soldOutAt" = CASE WHEN "cap" IS NOT NULL AND "sold" + ${quantity} >= "cap" THEN now() ELSE "soldOutAt" END
    WHERE "productId" = ${productId}
  `;
}

/** Called on payment failure, or by the expiry sweep for abandoned checkouts (~10min hold). */
export async function releaseReservation(productId: string, quantity = 1, client: DbClient = db): Promise<void> {
  await client.$executeRaw`
    UPDATE "StockPolicy" SET "reserved" = GREATEST("reserved" - ${quantity}, 0) WHERE "productId" = ${productId}
  `;
}

/**
 * Reverses a *confirmed* sale — the unit returns to the pool. Used only when
 * an unclaimed gift expires (PRD §7.3: "returning the unit and refunding the
 * buyer"), never for a normal refund/takedown, which deliberately leaves
 * sold counts alone (a creator's own delete isn't a scarcity do-over). Undoes
 * confirmStock's increment and un-sets soldOutAt if the item is back under cap.
 */
export async function releaseConfirmedUnit(productId: string, client: DbClient = db): Promise<void> {
  await client.$executeRaw`
    UPDATE "StockPolicy"
    SET "sold" = GREATEST("sold" - 1, 0),
        "soldOutAt" = CASE WHEN "cap" IS NOT NULL AND "sold" - 1 < "cap" THEN NULL ELSE "soldOutAt" END
    WHERE "productId" = ${productId}
  `;
}
