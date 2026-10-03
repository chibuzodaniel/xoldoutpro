import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { countTicketsSold } from "@/lib/commerce/eventRestore";

async function loadOwnedTier(eventId: string, tierProductId: string, userId: string) {
  const tier = await db.ticketTier.findUnique({
    where: { productId: tierProductId },
    include: { event: true, product: true },
  });
  if (!tier || tier.eventId !== eventId || tier.event.creatorId !== userId) return null;
  return tier;
}

const patchSchema = z.object({ paused: z.boolean() });

// Reversible, unlike DELETE below: the creator can take a tier off sale to
// stop new purchases (e.g. a tier they want to stop selling temporarily)
// and bring it back any time. Existing tickets/entitlements are untouched
// either way — this only gates /api/orders and public display.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; tierId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, tierId } = await params;
    const { paused } = patchSchema.parse(await req.json());

    const tier = await loadOwnedTier(id, tierId, user.id);
    if (!tier) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (tier.product.status === "DELETED") return NextResponse.json({ error: "Tier already deleted" }, { status: 409 });

    await db.ticketTier.update({ where: { productId: tierId }, data: { pausedAt: paused ? new Date() : null } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not update tier" }, { status: 500 });
  }
}

// A tier is never edited once created — name/price/cap are frozen the moment
// it goes live, since a buyer's receipt should always match what they saw.
// Pausing (PATCH above) is for a temporary stop; this is permanent removal
// from the catalog, same soft-delete as the whole-event DELETE below, so
// existing Entitlements/tickets are untouched — this is "off sale", not a refund.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; tierId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, tierId } = await params;

    const tier = await loadOwnedTier(id, tierId, user.id);
    if (!tier) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (tier.product.status === "DELETED") return NextResponse.json({ error: "Tier already deleted" }, { status: 409 });

    // Same rule as the whole-event DELETE (explicit ask, after an owner
    // deleted a tier 10 people held tickets for): a tier with ticket holders
    // can only be hidden (PATCH pause above), never deleted.
    const ticketsSold = await countTicketsSold([tierId]);
    if (ticketsSold > 0) {
      return NextResponse.json(
        {
          error: `${ticketsSold} ticket${ticketsSold === 1 ? " has" : "s have"} already been sold for this tier, so it can't be deleted. Hide it instead — that stops sales and existing tickets stay valid.`,
          ticketsSold,
        },
        { status: 409 },
      );
    }

    await db.product.update({ where: { id: tierId }, data: { status: "DELETED", deletedAt: new Date() } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Could not delete tier" }, { status: 500 });
  }
}
