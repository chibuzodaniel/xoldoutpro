import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { EVENT_TYPES } from "@/lib/discover/sectionFilters";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertCanPublish, recordProductsPublished, UploadCapError } from "@/lib/commerce/creatorPlans";
import { lineupSchema, lineupEntriesSchema, lineupOwnerSelect, validateLineup, setLineup, notifyLineupAdded, LineupError } from "@/lib/event/lineup";

const tierSchema = z.object({
  name: z.string().min(1).max(60),
  priceKobo: z.number().int().min(0),
  cap: z.number().int().positive().nullable(),
  // Most of this ticket type one buyer can get (2026-11-11).
  maxPerBuyer: z.number().int().min(1).max(100).nullable().optional(),
});

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  coverImageLadder: z.record(z.string(), z.string()),
  venue: z.string().max(200).optional(),
  isVirtual: z.boolean().default(false),
  // Discover chips / Near You (v2) — optional.
  eventType: z.enum(EVENT_TYPES).optional(),
  city: z.string().trim().max(80).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  tiers: z.array(tierSchema).min(1).max(10),
  // XOLDOUT accounts on the lineup, in order (v2). Optional.
  lineupUserIds: lineupSchema.default([]),
  // With roles (2026-11-11); preferred over lineupUserIds when sent.
  lineup: lineupEntriesSchema.optional(),
  // Most tickets one buyer can get for the whole event (2026-11-11).
  maxPerBuyer: z.number().int().min(1).max(100).nullable().optional(),
});

// Each tier is its own Product (DECISIONS.md: deliberate deviation from the
// PRD's diagram) so StockPolicy/Entitlement/reserveStock/recordSale apply
// unchanged — buying "VIP" is buying that tier's Product.
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const body = createSchema.parse(await req.json());
    await assertCanPublish(user, body.tiers.length);
    const lineup = body.lineup ?? body.lineupUserIds.map((userId) => ({ userId, role: "ARTIST" as const }));
    await validateLineup(lineup);

    const { full: event, invited: invitedEntries } = await db.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          creatorId: user.id,
          title: body.title,
          description: body.description,
          coverImageLadder: body.coverImageLadder,
          venue: body.venue,
          isVirtual: body.isVirtual,
          eventType: body.eventType,
          city: body.city || undefined,
          startsAt: new Date(body.startsAt),
          maxPerBuyer: body.maxPerBuyer ?? null,
          endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });

      for (const [i, tier] of body.tiers.entries()) {
        await tx.product.create({
          data: {
            creatorId: user.id,
            type: "EVENT",
            title: `${body.title} — ${tier.name}`,
            description: body.description,
            priceKobo: tier.priceKobo,
            status: "PUBLISHED",
            publishedAt: new Date(),
            ticketTier: { create: { eventId: created.id, name: tier.name, order: i, maxPerBuyer: tier.maxPerBuyer ?? null } },
            stockPolicy: { create: { cap: tier.cap } },
          },
        });
      }

      const invited = await setLineup(tx, created.id, lineup, user.id);

      const full = await tx.event.findUniqueOrThrow({
        where: { id: created.id },
        include: { tiers: { include: { product: { include: { stockPolicy: true } } }, orderBy: { order: "asc" } } },
      });
      return { full, invited };
    });
    await recordProductsPublished(user.id, body.tiers.length);
    notifyLineupAdded({ eventId: event.id, title: event.title, organiserId: user.id, organiserName: user.displayName, entries: invitedEntries });

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof LineupError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof UploadCapError) return NextResponse.json({ error: err.message, reason: err.reason }, { status: 403 });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not publish event" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const events = await db.event.findMany({
      where: { creatorId: user.id },
      include: {
        lineup: lineupOwnerSelect,
        tiers: {
          where: { product: { status: { not: "DELETED" } } },
          include: { product: { include: { stockPolicy: true } } },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ events });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
