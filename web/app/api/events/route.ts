import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const tierSchema = z.object({
  name: z.string().min(1).max(60),
  priceKobo: z.number().int().min(0),
  cap: z.number().int().positive().nullable(),
});

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  coverImageLadder: z.record(z.string(), z.string()),
  venue: z.string().max(200).optional(),
  isVirtual: z.boolean().default(false),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  tiers: z.array(tierSchema).min(1).max(10),
});

// Each tier is its own Product (DECISIONS.md: deliberate deviation from the
// PRD's diagram) so StockPolicy/Entitlement/reserveStock/recordSale apply
// unchanged — buying "VIP" is buying that tier's Product.
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const body = createSchema.parse(await req.json());

    const event = await db.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          creatorId: user.id,
          title: body.title,
          description: body.description,
          coverImageLadder: body.coverImageLadder,
          venue: body.venue,
          isVirtual: body.isVirtual,
          startsAt: new Date(body.startsAt),
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
            ticketTier: { create: { eventId: created.id, name: tier.name, order: i } },
            stockPolicy: { create: { cap: tier.cap } },
          },
        });
      }

      return tx.event.findUniqueOrThrow({
        where: { id: created.id },
        include: { tiers: { include: { product: { include: { stockPolicy: true } } }, orderBy: { order: "asc" } } },
      });
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
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
