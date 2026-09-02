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

  // A group buy creates one Entitlement per ticket (see schema comment) —
  // grouped into a list per tier here so the buyer sees every ticket they
  // hold, not just the most recent.
  const entitlements = user
    ? await db.entitlement.findMany({
        where: { userId: user.id, productId: { in: event.tiers.map((t) => t.productId) }, revokedAt: null },
        include: { checkIn: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const byProductId = new Map<string, typeof entitlements>();
  for (const ent of entitlements) {
    const list = byProductId.get(ent.productId) ?? [];
    list.push(ent);
    byProductId.set(ent.productId, list);
  }

  return NextResponse.json({
    isOwner: user ? event.creatorId === user.id : false,
    tiers: event.tiers.map((tier) => {
      const owned = byProductId.get(tier.productId) ?? [];
      return {
        productId: tier.productId,
        entitled: owned.length > 0,
        tickets: owned.map((e) => ({ checkInCode: e.checkIn?.code ?? null, checkedInAt: e.checkIn?.checkedInAt ?? null })),
      };
    }),
  });
}
