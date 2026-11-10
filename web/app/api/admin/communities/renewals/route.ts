import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/session";
import { requireModeratorPanel } from "@/lib/moderation/panelAccess";
import { runMembershipRenewals } from "@/lib/communities/renewals";
import { runSubscriptionRenewals } from "@/lib/subscriptions/renewals";

// "Run renewal job now" (prototype): the same work the daily cron does for
// memberships and catalog subscriptions. Safe to repeat — each item is
// handled once per period.
export async function POST(req: NextRequest) {
  try {
    await requireModeratorPanel(req, "communities");
    const [memberships, subscriptions] = await Promise.all([runMembershipRenewals(), runSubscriptionRenewals()]);
    return NextResponse.json({ memberships, subscriptions });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Renewal job failed" }, { status: 500 });
  }
}
