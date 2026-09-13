import { db } from "@/lib/db";

export async function getEventDetail(id: string) {
  const event = await db.event.findUnique({
    where: { id },
    include: {
      creator: { select: { handle: true, displayName: true } },
      tiers: {
        include: { product: { select: { priceKobo: true, stockPolicy: { select: { cap: true, sold: true, soldOutAt: true } } } } },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!event || event.status !== "PUBLISHED") return null;
  return event;
}
