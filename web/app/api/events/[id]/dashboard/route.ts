import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Host dashboard for one event (2026-11-11): ticket sales by type, discounts,
// promoters (applications, clicks, tickets, commission) and settings.
// A handful of grouped queries — nothing per row.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const event = await db.event.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        creatorId: true,
        startsAt: true,
        promotersOpen: true,
        promoterPayType: true,
        promoterMinPercent: true,
        promoterMaxPercent: true,
        promoterFlatKobo: true,
        maxPerBuyer: true,
        tiers: {
          orderBy: { order: "asc" },
          select: { productId: true, name: true, maxPerBuyer: true, pausedAt: true, product: { select: { priceKobo: true, status: true, stockPolicy: { select: { cap: true, sold: true } } } } },
        },
      },
    });
    if (!event || event.creatorId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const tierIds = event.tiers.map((t) => t.productId);

    const [revenue, discounts, discountUse, promoters, promoterOrders, commissions] = await Promise.all([
      db.orderItem.groupBy({
        by: ["productId"],
        where: { productId: { in: tierIds }, order: { status: "PAID" } },
        _sum: { quantity: true },
      }),
      db.eventDiscount.findMany({ where: { eventId: id }, orderBy: { createdAt: "desc" } }),
      db.order.groupBy({ by: ["discountId"], where: { discount: { eventId: id }, status: "PAID" }, _count: { _all: true }, _sum: { discountKobo: true } }),
      db.eventPromoter.findMany({
        where: { eventId: id },
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, sharePercent: true, code: true, clickCount: true, createdAt: true, user: { select: { id: true, handle: true, displayName: true, avatarUrl: true } } },
      }),
      db.order.findMany({ where: { promoter: { eventId: id }, status: "PAID" }, select: { promoterId: true, items: { select: { quantity: true } } } }),
      db.walletLedgerEntry.groupBy({ by: ["userId"], where: { kind: "PROMOTER_CREDIT", order: { promoter: { eventId: id } } }, _sum: { amountKobo: true } }),
    ]);
    const paidRows = await db.orderItem.findMany({
      where: { productId: { in: tierIds }, order: { status: "PAID" } },
      select: { productId: true, priceKobo: true, quantity: true },
    });
    const grossByTier = new Map<string, number>();
    for (const r of paidRows) grossByTier.set(r.productId, (grossByTier.get(r.productId) ?? 0) + r.priceKobo * r.quantity);
    const ticketsByPromoter = new Map<string, number>();
    for (const o of promoterOrders) if (o.promoterId) ticketsByPromoter.set(o.promoterId, (ticketsByPromoter.get(o.promoterId) ?? 0) + o.items.reduce((n, i) => n + i.quantity, 0));

    return NextResponse.json({
      event: { ...event, tiers: undefined },
      tiers: event.tiers.map((t) => ({
        productId: t.productId,
        name: t.name,
        priceKobo: t.product.priceKobo,
        cap: t.product.stockPolicy?.cap ?? null,
        sold: revenue.find((r) => r.productId === t.productId)?._sum.quantity ?? t.product.stockPolicy?.sold ?? 0,
        grossKobo: grossByTier.get(t.productId) ?? 0,
        maxPerBuyer: t.maxPerBuyer,
        onSale: t.product.status === "PUBLISHED" && !t.pausedAt,
      })),
      discounts: discounts.map((d) => {
        const u = discountUse.find((x) => x.discountId === d.id);
        return { ...d, uses: u?._count._all ?? 0, totalOffKobo: u?._sum.discountKobo ?? 0 };
      }),
      promoters: promoters.map((p) => ({
        ...p,
        tickets: ticketsByPromoter.get(p.id) ?? 0,
        earnedKobo: commissions.find((c) => c.userId === p.user.id)?._sum.amountKobo ?? 0,
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
