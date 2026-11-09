import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Polled by app/(app)/subscriptions/callback (same shape as the XG top-up
// status route), keyed by the Payment's processorRef.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const ref = req.nextUrl.searchParams.get("ref");
    if (!ref) return NextResponse.json({ error: "Missing ref" }, { status: 400 });

    const payment = await db.payment.findUnique({
      where: { processorRef: ref },
      select: { status: true, subscriptionSubscriberId: true, subscriptionCreatorId: true },
    });
    if (!payment || payment.subscriptionSubscriberId !== user.id || !payment.subscriptionCreatorId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const [creator, sub] = await Promise.all([
      db.user.findUnique({ where: { id: payment.subscriptionCreatorId }, select: { displayName: true, handle: true } }),
      payment.status === "SUCCESSFUL"
        ? db.catalogSubscription.findUnique({
            where: { subscriberId_creatorId: { subscriberId: user.id, creatorId: payment.subscriptionCreatorId } },
            select: { currentPeriodEnd: true },
          })
        : null,
    ]);
    return NextResponse.json({ status: payment.status, creator, currentPeriodEnd: sub?.currentPeriodEnd ?? null });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
