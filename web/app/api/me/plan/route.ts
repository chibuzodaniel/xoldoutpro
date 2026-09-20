import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { setCreatorPlan, activateOrRenewLimitedPlan, getCreatorPlanSettings } from "@/lib/commerce/creatorPlans";

/**
 * Current plan + everything the client needs to render plan state (cap
 * usage, moderator-editable rates/fees) without a second round trip — the
 * profile "Creator plan" row, the publish-flow gate, and PlanPickerSheet all
 * read this. Product count is live (matches assertCanPublish's own BUYER_
 * PAYS_FEE check), not trusted from a stale client cache.
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const [settings, liveProductCount] = await Promise.all([
      getCreatorPlanSettings(),
      db.product.count({ where: { creatorId: user.id, status: { not: "DELETED" } } }),
    ]);
    return NextResponse.json({
      plan: user.creatorPlan,
      limitedUploadsUsed: user.limitedUploadsUsed,
      limitedSalesCount: user.limitedSalesCount,
      buyerPaysFeeBonusSlots: user.buyerPaysFeeBonusSlots,
      liveProductCount,
      settings,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const bodySchema = z.object({ plan: z.enum(["UNLIMITED", "BUYER_PAYS_FEE", "LIMITED"]) });

// Free/instant for UNLIMITED and BUYER_PAYS_FEE (explicit ask: creators can
// switch freely, any direction, any time — including from the publish flow
// even when a plan is already set). LIMITED goes through the same
// wallet-or-Bachs flow whether this is a first join or a renewal.
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { plan } = bodySchema.parse(await req.json());

    if (plan === "LIMITED") {
      const result = await activateOrRenewLimitedPlan({
        userId: user.id,
        origin: req.nextUrl.origin,
        customerEmail: user.email,
        customerName: user.displayName,
      });
      return NextResponse.json(result, { status: 201 });
    }

    await setCreatorPlan(user.id, plan);
    return NextResponse.json({ mode: "instant", plan });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not update plan" }, { status: 502 });
  }
}
