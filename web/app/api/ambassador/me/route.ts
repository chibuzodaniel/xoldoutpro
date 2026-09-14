import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  getAmbassadorRevenueGeneratedKobo,
  getAmbassadorTierRatePercent,
} from "@/lib/commerce/ledger";
import { ambassadorTierFor, nextAmbassadorTier, AMBASSADOR_TIER_THRESHOLDS_KOBO } from "@/lib/commerce/constants";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);

    const latestApplication = await db.ambassadorApplication.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    if (!user.isAmbassador) {
      return NextResponse.json({ isAmbassador: false, application: latestApplication });
    }

    const [referredCount, revenueGeneratedKobo] = await Promise.all([
      db.user.count({ where: { referredByAmbassadorId: user.id } }),
      getAmbassadorRevenueGeneratedKobo(db, user.id),
    ]);

    const tier = ambassadorTierFor(revenueGeneratedKobo);
    const commissionPercent = await getAmbassadorTierRatePercent(db, tier);
    const next = nextAmbassadorTier(tier);
    const nextTier = next
      ? {
          name: next,
          remainingKobo: AMBASSADOR_TIER_THRESHOLDS_KOBO[next] - revenueGeneratedKobo,
          commissionPercent: await getAmbassadorTierRatePercent(db, next),
        }
      : null;

    return NextResponse.json({
      isAmbassador: true,
      ambassadorCode: user.ambassadorCode,
      referredCount,
      revenueGeneratedKobo,
      tier,
      commissionPercent,
      nextTier,
      application: latestApplication,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Explicit ask: ambassadors can rename their own referral code to something
// memorable instead of the random slug generated at approval. Same
// shape/validation as handle editing (app/api/me/route.ts) — lowercase
// letters/digits/underscore, 3-24 chars — since this also ends up in a
// public URL (`?ref=<code>`). Free to change any time, no cooldown: an
// ambassador changing their own link only ever affects links they
// themselves shared going forward: existing signups already have their
// referredByAmbassadorId fixed at first sign-in and are never re-resolved
// from the code.
const patchSchema = z.object({
  ambassadorCode: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_]+$/, "lowercase letters, numbers, underscore only"),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { ambassadorCode } = patchSchema.parse(await req.json());

    if (!user.isAmbassador) {
      return NextResponse.json({ error: "Not an ambassador" }, { status: 403 });
    }

    if (ambassadorCode !== user.ambassadorCode) {
      const taken = await db.user.findUnique({ where: { ambassadorCode } });
      if (taken) return NextResponse.json({ error: "That code is already taken" }, { status: 409 });
    }

    const updated = await db.user.update({ where: { id: user.id }, data: { ambassadorCode } });
    return NextResponse.json({ ambassadorCode: updated.ambassadorCode });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
