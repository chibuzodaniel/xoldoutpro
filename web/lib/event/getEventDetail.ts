import { db } from "@/lib/db";
import { lineupSelect } from "@/lib/event/lineup";

export async function getEventDetail(id: string) {
  const event = await db.event.findUnique({
    where: { id },
    include: {
      creator: { select: { handle: true, displayName: true } },
      // v2: additive field, in order.
      lineup: lineupSelect,
      // Deleted (permanent) and paused (creator-toggled, reversible — see
      // app/api/events/[id]/tiers/[tierId]'s PATCH) tiers are off sale:
      // exclude them from every consumer of this shared lookup (web's own
      // /e/[id] page queries separately and applies the same filter itself).
      tiers: {
        where: { product: { status: "PUBLISHED" }, pausedAt: null },
        include: { product: { select: { priceKobo: true, stockPolicy: { select: { cap: true, sold: true, soldOutAt: true } } } } },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!event || event.status !== "PUBLISHED") return null;
  return event;
}
