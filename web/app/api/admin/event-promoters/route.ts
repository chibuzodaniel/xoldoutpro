import { NextRequest, NextResponse } from "next/server";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Moderator view across every event's ticket promoters (the event owner's
// own view, EventPromotersPanel, is scoped to their own events only — this
// is the platform-wide list moderation needs). Optional ?q= filters by
// promoter handle/displayName or event title, same "type 2+ chars" shape as
// /api/search elsewhere.
export async function GET(req: NextRequest) {
  try {
    await requireModerator(req);
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

    const promoters = await db.eventPromoter.findMany({
      where:
        q.length >= 2
          ? {
              OR: [
                { user: { handle: { contains: q, mode: "insensitive" } } },
                { user: { displayName: { contains: q, mode: "insensitive" } } },
                { event: { title: { contains: q, mode: "insensitive" } } },
              ],
            }
          : undefined,
      include: {
        user: { select: { handle: true, displayName: true } },
        event: { select: { id: true, title: true, creator: { select: { handle: true, displayName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

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
    throw err;
  }
}
