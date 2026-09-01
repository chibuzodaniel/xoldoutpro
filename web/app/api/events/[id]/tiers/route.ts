import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const tierSchema = z.object({
  name: z.string().min(1).max(60),
  priceKobo: z.number().int().min(0),
  cap: z.number().int().positive().nullable(),
});

// Adding a tier is the one way to change what's on sale after publish, now
// that existing tiers are frozen (see tiers/[tierId]'s DELETE) — a new price
// point or a restocked "Early Bird v2" goes here instead of editing the old one.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const body = tierSchema.parse(await req.json());

    const event = await db.event.findUnique({ where: { id }, include: { tiers: true } });
    if (!event || event.creatorId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (event.status === "DELETED") return NextResponse.json({ error: "Event is deleted" }, { status: 409 });
    if (event.tiers.length >= 10) return NextResponse.json({ error: "An event can have at most 10 tiers" }, { status: 400 });

    const nextOrder = event.tiers.reduce((max, t) => Math.max(max, t.order), -1) + 1;

    const product = await db.product.create({
      data: {
        creatorId: user.id,
        type: "EVENT",
        title: `${event.title} — ${body.name}`,
        description: event.description,
        priceKobo: body.priceKobo,
        status: "PUBLISHED",
        publishedAt: new Date(),
        ticketTier: { create: { eventId: event.id, name: body.name, order: nextOrder } },
        stockPolicy: { create: { cap: body.cap } },
      },
      include: { stockPolicy: true, ticketTier: true },
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not add tier" }, { status: 500 });
  }
}
