import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DEFAULT_AMBASSADOR_TIER_RATES, type AmbassadorTier } from "@/lib/commerce/constants";

const TIERS: AmbassadorTier[] = ["SILVER", "GOLD"];

export async function GET(req: NextRequest) {
  try {
    await requireModerator(req);
    const rows = await db.ambassadorTierRate.findMany();
    const byTier = new Map(rows.map((r) => [r.tier, r]));
    const rates = TIERS.map((tier) => {
      const row = byTier.get(tier);
      return {
        tier,
        firstPurchasePercent: row?.firstPurchasePercent ?? DEFAULT_AMBASSADOR_TIER_RATES[tier].firstPurchasePercent,
        continuousPercent: row?.continuousPercent ?? DEFAULT_AMBASSADOR_TIER_RATES[tier].continuousPercent,
      };
    });
    return NextResponse.json({ rates });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const patchSchema = z.object({
  tier: z.enum(["SILVER", "GOLD"]),
  firstPurchasePercent: z.number().int().min(0).max(100),
  continuousPercent: z.number().int().min(0).max(100),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireModerator(req);
    const { tier, firstPurchasePercent, continuousPercent } = patchSchema.parse(await req.json());

    const row = await db.ambassadorTierRate.upsert({
      where: { tier },
      create: { tier, firstPurchasePercent, continuousPercent, updatedBy: user.id },
      update: { firstPurchasePercent, continuousPercent, updatedBy: user.id },
    });

    return NextResponse.json({ rate: row });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
