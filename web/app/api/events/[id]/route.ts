import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isWithinEditWindow, EDIT_WINDOW_HOURS } from "@/lib/editWindow";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  venue: z.string().max(200).optional(),
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
    if (!isWithinEditWindow(event.publishedAt)) {
      return NextResponse.json({ error: `Editing closes ${EDIT_WINDOW_HOURS} hours after an event goes live` }, { status: 403 });
    }

    const updated = await db.event.update({
      where: { id },
      data: { title: body.title, description: body.description, venue: body.venue },
      include: { tiers: { include: { product: { include: { stockPolicy: true } } } } },
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
