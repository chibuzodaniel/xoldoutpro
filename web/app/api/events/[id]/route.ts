import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { countTicketsSold } from "@/lib/commerce/eventRestore";
import { getEventDetail } from "@/lib/event/getEventDetail";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventDetail(id);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ event });
}

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  venue: z.string().max(200).optional(),
  coverImageLadder: z.record(z.string(), z.string()).optional(),
});

async function loadOwned(id: string, userId: string) {
  const event = await db.event.findUnique({ where: { id }, include: { tiers: true } });
  if (!event || event.creatorId !== userId) return null;
  return event;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const event = await loadOwned(id, user.id);
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (event.status === "DELETED") return NextResponse.json({ error: "Event is deleted" }, { status: 409 });

    // Unlike Release/Beat/Merch, an event's own details have no edit-window
    // cutoff — what a buyer is owed is the live show, not the listing as it
    // read at purchase time, so venue/description/cover can change right up
    // until the event happens. Ticket tiers are the part that's frozen once
    // sold against (see the tiers/[tierId] route) — this route never touches them.
    const updated = await db.event.update({
      where: { id },
      data: { title: body.title, description: body.description, venue: body.venue, coverImageLadder: body.coverImageLadder },
      include: {
        tiers: {
          where: { product: { status: { not: "DELETED" } } },
          include: { product: { include: { stockPolicy: true } } },
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json({ event: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not update event" }, { status: 500 });
  }
}

// Delete never removes what a fan bought — withdraws the event and every
// tier from sale/discovery only. Cascades to every tier's Product so none
// of them stay independently purchasable; existing Entitlements/tickets
// (and their check-in codes) are untouched.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const event = await loadOwned(id, user.id);
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // An event people hold tickets for can't be deleted (explicit ask, after
    // an owner deleted one by mistake right before it ran) — the owner hides
    // its tiers instead (TicketTier.pausedAt), which stops sales while every
    // ticket stays valid and scannable at the door.
    const ticketsSold = await countTicketsSold(event.tiers.map((t) => t.productId));
    if (ticketsSold > 0) {
      return NextResponse.json(
        {
          error: `${ticketsSold} ticket${ticketsSold === 1 ? " has" : "s have"} already been sold for this event, so it can't be deleted. Hide its ticket tiers instead to stop sales — existing tickets stay valid.`,
          ticketsSold,
        },
        { status: 409 },
      );
    }

    await db.$transaction(async (tx) => {
      await tx.event.update({ where: { id }, data: { status: "DELETED", deletedAt: new Date() } });
      await tx.product.updateMany({
        where: { id: { in: event.tiers.map((t) => t.productId) } },
        data: { status: "DELETED", deletedAt: new Date() },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Could not delete event" }, { status: 500 });
  }
}
