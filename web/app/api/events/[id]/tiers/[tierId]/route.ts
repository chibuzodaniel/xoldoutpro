import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

async function loadOwnedTier(eventId: string, tierProductId: string, userId: string) {
  const tier = await db.ticketTier.findUnique({
    where: { productId: tierProductId },
    include: { event: true, product: true },
  });
  if (!tier || tier.eventId !== eventId || tier.event.creatorId !== userId) return null;
  return tier;
}

// A tier is never edited once created — name/price/cap are frozen the moment
// it goes live, since a buyer's receipt should always match what they saw.
// The only mutation left is withdrawing it from sale entirely, which is what
// this does: same soft-delete as the whole-event DELETE below, so existing
// Entitlements/tickets are untouched — this is "off sale", not a refund.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; tierId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, tierId } = await params;

    const tier = await loadOwnedTier(id, tierId, user.id);
    if (!tier) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (tier.product.status === "DELETED") return NextResponse.json({ error: "Tier already deleted" }, { status: 409 });

    await db.product.update({ where: { id: tierId }, data: { status: "DELETED", deletedAt: new Date() } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Could not delete tier" }, { status: 500 });
  }
}
