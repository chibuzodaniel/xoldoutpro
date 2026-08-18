import { db } from "@/lib/db";

// Shared by both places an EVENT order can settle (the free-purchase path
// in /api/orders and the Flutterwave webhook) — fetches the event details
// needed to render the ticket in the confirmation email.
export async function buildTicketInfo(productId: string, checkInCode: string) {
  const tier = await db.ticketTier.findUnique({
    where: { productId },
    include: { event: { select: { title: true, venue: true, isVirtual: true, startsAt: true } } },
  });
  if (!tier) return null;
  return {
    checkInCode,
    tierName: tier.name,
    eventTitle: tier.event.title,
    venue: tier.event.venue,
    isVirtual: tier.event.isVirtual,
    startsAt: tier.event.startsAt,
  };
}
