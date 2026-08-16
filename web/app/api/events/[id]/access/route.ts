import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Public browsing info — served to signed-out visitors too (isOwner/entitled
// default false, no check-in codes). Only /api/orders (the actual ticket
// purchase) requires a signed-in user.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser(req);
  const { id } = await params;

  const event = await db.event.findUnique({
    where: { id },
    include: { tiers: { orderBy: { order: "asc" } } },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entitlements = user
    ? await db.entitlement.findMany({
        where: { userId: user.id, productId: { in: event.tiers.map((t) => t.productId) }, revokedAt: null },
        include: { checkIn: true },
      })
    : [];
  const byProductId = new Map(entitlements.map((e) => [e.productId, e]));

  return NextResponse.json({
    isOwner: user ? event.creatorId === user.id : false,
    tiers: event.tiers.map((tier) => {
      const entitlement = byProductId.get(tier.productId);
      return {
        productId: tier.productId,
        entitled: Boolean(entitlement),
        checkInCode: entitlement?.checkIn?.code ?? null,
        checkedInAt: entitlement?.checkIn?.checkedInAt ?? null,
      };
    }),
  });
}
