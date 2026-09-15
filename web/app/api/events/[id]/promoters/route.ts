import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sendPromoterAddedEmail } from "@/lib/email";

const SITE_URL = "https://www.xoldout.app";

// Ticket promoter split (per-event, independent of the platform-wide
// Ambassador program — DECISIONS-equivalent design note in the plan this
// shipped from): the event creator adds any user by handle and sets a % of
// their OWN net proceeds to share on tickets sold through that promoter's
// `?promo=<code>` link.

async function loadOwnedEvent(id: string, userId: string) {
  const event = await db.event.findUnique({ where: { id } });
  if (!event || event.creatorId !== userId) return null;
  return event;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const event = await loadOwnedEvent(id, user.id);
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const promoters = await db.eventPromoter.findMany({
      where: { eventId: id },
      include: { user: { select: { handle: true, displayName: true } } },
      orderBy: { createdAt: "asc" },
    });

    // "Referred" = tickets sold (order item quantity, not order count — a
    // single order can buy more than one ticket) through each promoter's own
    // link, paid orders only. Few promoters per event in practice, so one
    // query + in-JS aggregation beats a groupBy across a join.
    const paidOrders = await db.order.findMany({
      where: { promoterId: { in: promoters.map((p) => p.id) }, status: "PAID" },
      select: { promoterId: true, items: { select: { quantity: true } } },
    });
    const referredByPromoterId = new Map<string, number>();
    for (const order of paidOrders) {
      if (!order.promoterId) continue;
      const qty = order.items.reduce((sum, i) => sum + i.quantity, 0);
      referredByPromoterId.set(order.promoterId, (referredByPromoterId.get(order.promoterId) ?? 0) + qty);
    }

    return NextResponse.json({
      promoters: promoters.map((p) => ({ ...p, referredCount: referredByPromoterId.get(p.id) ?? 0 })),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const postSchema = z.object({
  handle: z.string().trim().min(1).max(60),
  sharePercent: z.number().int().min(1).max(90),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { handle, sharePercent } = postSchema.parse(await req.json());

    const event = await loadOwnedEvent(id, user.id);
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const trimmedHandle = handle.replace(/^@/, "");
    const target = await db.user.findUnique({ where: { handle: trimmedHandle } });
    if (!target) return NextResponse.json({ error: `No user @${trimmedHandle}` }, { status: 404 });
    if (target.id === user.id) {
      return NextResponse.json({ error: "You can't be your own promoter" }, { status: 400 });
    }

    const existing = await db.eventPromoter.findUnique({
      where: { eventId_userId: { eventId: id, userId: target.id } },
    });

    const promoter = await db.eventPromoter.upsert({
      where: { eventId_userId: { eventId: id, userId: target.id } },
      create: { eventId: id, userId: target.id, sharePercent },
      update: { sharePercent },
      include: { user: { select: { handle: true, displayName: true } } },
    });

    // Only on genuine first-add, not on a later edit of their percentage —
    // explicit ask, 2026-09-15: "promoters should receive a mail if they
    // are added as a promoter," with their own referral link right in it.
    if (!existing) {
      void sendPromoterAddedEmail({
        to: target.email,
        promoterName: target.displayName,
        eventTitle: event.title,
        eventOwnerName: user.displayName,
        sharePercent,
        referralUrl: `${SITE_URL}/e/${id}?promo=${promoter.code}`,
      }).catch((err) => console.error("promoter added email failed", err));
    }

    return NextResponse.json({ promoter }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
