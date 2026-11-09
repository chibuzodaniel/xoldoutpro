import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// The signed-in fan's catalog subscriptions (Library → Your Subscriptions),
// or — with ?creatorId= — just the one for that artist (profile button).
// Each row carries the artist's current plans so Renew/Resubscribe can price it.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const creatorId = req.nextUrl.searchParams.get("creatorId");
    const subs = await db.catalogSubscription.findMany({
      where: { subscriberId: user.id, ...(creatorId ? { creatorId } : {}) },
      orderBy: { currentPeriodEnd: "desc" },
      take: 100,
      select: {
        id: true,
        creatorId: true,
        durationDays: true,
        priceKobo: true,
        startedAt: true,
        currentPeriodEnd: true,
        autoRenew: true,
        cardProcessor: true,
        creator: {
          select: {
            handle: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
            catalogSubscriptionOn: true,
            subscriptionPlans: { select: { durationDays: true, priceKobo: true }, orderBy: { durationDays: "asc" } },
          },
        },
      },
    });
    return NextResponse.json({
      subscriptions: subs.map(({ cardProcessor, ...s }) => ({ ...s, savedCard: Boolean(cardProcessor) })),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
