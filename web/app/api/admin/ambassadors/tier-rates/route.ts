import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DEFAULT_AMBASSADOR_TIER_RATES, type AmbassadorTier } from "@/lib/commerce/constants";

const TIERS: AmbassadorTier[] = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];

export async function GET(req: NextRequest) {
  try {
    await requireModerator(req);
    const rows = await db.ambassadorTierRate.findMany();
    const byTier = new Map(rows.map((r) => [r.tier, r.percent]));
    const rates = TIERS.map((tier) => ({ tier, percent: byTier.get(tier) ?? DEFAULT_AMBASSADOR_TIER_RATES[tier] }));
    return NextResponse.json({ rates });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const patchSchema = z.object({
  tier: z.enum(["BRONZE", "SILVER", "GOLD", "PLATINUM"]),
  percent: z.number().int().min(0).max(100),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireModerator(req);
    const { tier, percent } = patchSchema.parse(await req.json());

    const row = await db.ambassadorTierRate.upsert({
      where: { tier },
      create: { tier, percent, updatedBy: user.id },
      update: { percent, updatedBy: user.id },
    });

    return NextResponse.json({ rate: row });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
