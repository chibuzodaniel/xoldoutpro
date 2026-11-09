import { z } from "zod";
import { MAX_LICENSES } from "@/lib/commerce/licenseTerms";

// Server-side validation for beat license tiers (lib/commerce/licenseTerms.ts
// holds the shared types and text).

const termsSchema = z.object({
  streams: z.number().int().positive().nullable(),
  commercialUse: z.boolean(),
  monetization: z.boolean(),
  distribution: z.boolean(),
  musicVideo: z.boolean(),
  youtube: z.enum(["monetized", "allowed", "no"]),
  radio: z.boolean(),
  livePerformances: z.number().int().min(0).nullable(),
  contentId: z.boolean(),
  durationYears: z.number().int().positive().max(99).nullable(),
  credit: z.string().trim().max(120),
});

export const licenseInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  priceKobo: z.number().int().positive(),
  formats: z.array(z.enum(["MP3", "WAV", "Stems"])).min(1).max(3),
  isExclusive: z.boolean(),
  terms: termsSchema,
});

export const licensesSchema = z
  .array(licenseInputSchema)
  .max(MAX_LICENSES)
  .refine((ls) => ls.filter((l) => l.isExclusive).length <= 1, { message: "Only one license can be exclusive" })
  .refine((ls) => new Set(ls.map((l) => l.name.toLowerCase())).size === ls.length, { message: "Each license needs a different name" });

export type LicenseInput = z.infer<typeof licenseInputSchema>;

/** True when an order line's license snapshot is an exclusive tier. */
export function isExclusiveSnapshot(snapshot: unknown): boolean {
  return Boolean(snapshot && typeof snapshot === "object" && (snapshot as { isExclusive?: unknown }).isExclusive === true);
}

/**
 * An exclusive license sold: the beat stops selling. Caps the beat's stock at
 * what has sold so far (same "sold out stays sold out" rule as any capped
 * listing), inside the sale's own transaction.
 */
export async function closeBeatAfterExclusive(tx: { $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number> }, productId: string) {
  await tx.$executeRaw`
    UPDATE "StockPolicy" SET "cap" = "sold", "soldOutAt" = COALESCE("soldOutAt", now()) WHERE "productId" = ${productId}
  `;
}
