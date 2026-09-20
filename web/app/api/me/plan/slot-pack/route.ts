import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { buyBuyerPaysFeeSlotPack } from "@/lib/commerce/creatorPlans";

/** Buys another buyerPaysFeeSlotPackSize upload slots — stacks, never resets. */
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    if (user.creatorPlan !== "BUYER_PAYS_FEE") {
      return NextResponse.json({ error: "Slot packs are only for the Buyer Pays Fee plan" }, { status: 400 });
    }

    const result = await buyBuyerPaysFeeSlotPack({
      userId: user.id,
      origin: req.nextUrl.origin,
      customerEmail: user.email,
      customerName: user.displayName,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Could not start slot-pack checkout" }, { status: 502 });
  }
}
