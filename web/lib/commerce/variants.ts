import type { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";

// Merch sizes & colours (v2, 2026-11-09) — stock for one MerchVariant.
// Same atomic shape as lib/commerce/stock.ts (which still guards the whole
// listing): a single conditional UPDATE, so two buyers can never both take
// the last unit of a size. Every call site pairs these with the matching
// product-level call (reserve ↔ reserve, confirm ↔ confirm, release ↔
// release) so the two counts move together.

type DbClient = typeof db | Prisma.TransactionClient;

export const MAX_VARIANTS = 60;
export const MAX_VARIANT_TEXT = 24;

export const variantInputSchema = z
  .object({
    size: z.string().trim().max(MAX_VARIANT_TEXT).optional().nullable(),
    color: z.string().trim().max(MAX_VARIANT_TEXT).optional().nullable(),
    cap: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => Boolean(v.size?.trim() || v.color?.trim()), { message: "Each option needs a size or a colour" });

export type VariantInput = z.infer<typeof variantInputSchema>;

/** "M · Black", "M", "Black" — what the buyer and the seller see. */
export function variantLabel(v: { size: string | null; color: string | null }) {
  return [v.size, v.color].filter((x) => x && x.trim()).join(" · ");
}

export async function reserveVariant(variantId: string, quantity: number, client: DbClient = db): Promise<boolean> {
  const rows = await client.$queryRaw<{ id: string }[]>`
    UPDATE "MerchVariant"
    SET "reserved" = "reserved" + ${quantity}
    WHERE "id" = ${variantId} AND ("cap" IS NULL OR "sold" + "reserved" + ${quantity} <= "cap")
    RETURNING "id"
  `;
  return rows.length > 0;
}

export async function confirmVariant(variantId: string, quantity: number, client: DbClient = db): Promise<void> {
  await client.$executeRaw`
    UPDATE "MerchVariant"
    SET "sold" = "sold" + ${quantity},
        "reserved" = GREATEST("reserved" - ${quantity}, 0),
        "soldOutAt" = CASE WHEN "cap" IS NOT NULL AND "sold" + ${quantity} >= "cap" THEN now() ELSE "soldOutAt" END
    WHERE "id" = ${variantId}
  `;
}

export async function releaseVariant(variantId: string, quantity: number, client: DbClient = db): Promise<void> {
  await client.$executeRaw`
    UPDATE "MerchVariant" SET "reserved" = GREATEST("reserved" - ${quantity}, 0) WHERE "id" = ${variantId}
  `;
}
