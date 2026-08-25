import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isWithinEditWindow, EDIT_WINDOW_HOURS } from "@/lib/editWindow";

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  priceKobo: z.number().int().min(0).optional(),
  cap: z.number().int().positive().optional(),
});

async function loadOwnedTier(eventId: string, tierProductId: string, userId: string) {
  const tier = await db.ticketTier.findUnique({
    where: { productId: tierProductId },
    include: { event: true, product: { include: { stockPolicy: true } } },
  });
  if (!tier || tier.eventId !== eventId || tier.event.creatorId !== userId) return null;
  return tier;
}

// Price has no historical-integrity restriction (matches Release/Beat/Merch —
// price edits are freely up or down). Cap follows the same rule as Release
// (PRD §7.2): lowering only, never raised or introduced, never below sold.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; tierId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, tierId } = await params;
    const body = patchSchema.parse(await req.json());

    const tier = await loadOwnedTier(id, tierId, user.id);
    if (!tier) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (tier.product.status === "DELETED") return NextResponse.json({ error: "Event is deleted" }, { status: 409 });
    if (!isWithinEditWindow(tier.product.publishedAt)) {
      return NextResponse.json({ error: `Editing closes ${EDIT_WINDOW_HOURS} hours after a tier goes live` }, { status: 403 });
    }

    if (body.cap !== undefined) {
      const policy = tier.product.stockPolicy;
      if (!policy || policy.cap === null) {
        return NextResponse.json({ error: "Cannot introduce a cap on an uncapped tier" }, { status: 400 });
      }
      if (body.cap > policy.cap) {
        return NextResponse.json({ error: "Cap can only be lowered, never raised" }, { status: 400 });
      }
      if (body.cap < policy.sold) {
        return NextResponse.json({ error: `Cap cannot go below tickets already sold (${policy.sold})` }, { status: 400 });
      }
      await db.stockPolicy.update({
        where: { productId: tierId },
        data: { cap: body.cap, soldOutAt: body.cap === policy.sold ? new Date() : policy.soldOutAt },
      });
    }

    const updated = await db.product.update({
      where: { id: tierId },
      data: {
        priceKobo: body.priceKobo,
        ticketTier: body.name !== undefined ? { update: { name: body.name } } : undefined,
      },
      include: { stockPolicy: true, ticketTier: true },
    });

    return NextResponse.json({ product: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not update ticket tier" }, { status: 500 });
  }
}
