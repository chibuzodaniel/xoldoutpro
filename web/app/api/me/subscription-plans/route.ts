import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { MAX_SUBSCRIPTION_PRICE_KOBO, MIN_SUBSCRIPTION_PRICE_KOBO, SUBSCRIPTION_DAYS } from "@/lib/subscriptions/plans";

// An artist's own catalog subscription settings (v2, design/v2-prototype):
// on/off plus a price per duration. Fans who already paid keep their period
// whatever changes here; a removed plan just isn't renewed.

async function load(userId: string) {
  const [user, plans, activeSubscribers] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { catalogSubscriptionOn: true } }),
    db.subscriptionPlan.findMany({
      where: { creatorId: userId },
      select: { durationDays: true, priceKobo: true },
      orderBy: { durationDays: "asc" },
    }),
    db.catalogSubscription.count({ where: { creatorId: userId, currentPeriodEnd: { gt: new Date() } } }),
  ]);
  return { on: user?.catalogSubscriptionOn ?? false, plans, activeSubscribers };
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    return NextResponse.json(await load(user.id));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const putSchema = z.object({
  on: z.boolean(),
  plans: z
    .array(
      z.object({
        durationDays: z
          .number()
          .int()
          .refine((d) => SUBSCRIPTION_DAYS.includes(d), "Unknown duration"),
        priceKobo: z.number().int().min(MIN_SUBSCRIPTION_PRICE_KOBO, "Paid plans need at least ₦100").max(MAX_SUBSCRIPTION_PRICE_KOBO),
      }),
    )
    .max(SUBSCRIPTION_DAYS.length),
});

export async function PUT(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const body = putSchema.parse(await req.json());
    const days = body.plans.map((p) => p.durationDays);
    if (new Set(days).size !== days.length) {
      return NextResponse.json({ error: "Each duration can only be listed once" }, { status: 400 });
    }
    if (body.on && body.plans.length === 0) {
      return NextResponse.json({ error: "Add at least one duration with a price" }, { status: 400 });
    }

    await db.$transaction([
      db.subscriptionPlan.deleteMany({ where: { creatorId: user.id, durationDays: { notIn: days } } }),
      ...body.plans.map((p) =>
        db.subscriptionPlan.upsert({
          where: { creatorId_durationDays: { creatorId: user.id, durationDays: p.durationDays } },
          create: { creatorId: user.id, durationDays: p.durationDays, priceKobo: p.priceKobo },
          update: { priceKobo: p.priceKobo },
        }),
      ),
      db.user.update({ where: { id: user.id }, data: { catalogSubscriptionOn: body.on } }),
    ]);
    return NextResponse.json(await load(user.id));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid plans" }, { status: 400 });
    }
    throw err;
  }
}
