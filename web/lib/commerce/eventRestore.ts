import { db } from "@/lib/db";

// Event deletion is a soft delete (app/api/events/[id]/route.ts DELETE):
// the Event and its tier Products are only marked DELETED — every ticket
// Entitlement and check-in code is untouched. That makes a mistaken delete
// fully reversible, which is what this file does (explicit ask: an owner
// deleted an event that already had ticket holders — restore it so they can
// hide the tiers instead, and tickets stay scannable at the door).

/** Unrevoked tickets across the given tier product ids. */
export async function countTicketsSold(tierProductIds: string[]): Promise<number> {
  if (tierProductIds.length === 0) return 0;
  return db.entitlement.count({ where: { productId: { in: tierProductIds }, revokedAt: null } });
}

export async function listDeletedEvents(query: string) {
  const q = query.trim();
  const events = await db.event.findMany({
    where: {
      status: "DELETED",
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { creator: { handle: { contains: q.replace(/^@/, ""), mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      deletedAt: true,
      creator: { select: { handle: true, displayName: true } },
      tiers: { select: { productId: true } },
    },
    orderBy: { deletedAt: "desc" },
    take: 25,
  });
  return Promise.all(
    events.map(async (e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.startsAt,
      deletedAt: e.deletedAt,
      creator: e.creator,
      ticketsSold: await countTicketsSold(e.tiers.map((t) => t.productId)),
    })),
  );
}

export class EventNotDeletedError extends Error {}

// The event DELETE stamps the event and its tiers with separate `new Date()`
// calls in one transaction — milliseconds apart, so "deleted together" is
// any tier whose deletedAt is within this window of the event's.
const SAME_DELETE_WINDOW_MS = 60_000;

/**
 * Undoes an event delete. Restores the event, plus only the tiers that were
 * deleted *with* it — a tier the owner had deleted on its own earlier stays
 * deleted. Comes back PUBLISHED if anyone holds a ticket (it must have been
 * live to sell), otherwise DRAFT so the owner decides whether to republish.
 */
export async function restoreDeletedEvent(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { tiers: { include: { product: { select: { id: true, status: true, deletedAt: true } } } } },
  });
  if (!event || event.status !== "DELETED" || !event.deletedAt) throw new EventNotDeletedError();

  const deletedAt = event.deletedAt.getTime();
  const tierIdsToRestore = event.tiers
    .filter((t) => t.product.status === "DELETED" && t.product.deletedAt && Math.abs(t.product.deletedAt.getTime() - deletedAt) <= SAME_DELETE_WINDOW_MS)
    .map((t) => t.product.id);

  const ticketsSold = await countTicketsSold(event.tiers.map((t) => t.productId));
  const status = ticketsSold > 0 ? "PUBLISHED" : "DRAFT";

  await db.$transaction([
    db.event.update({ where: { id: eventId }, data: { status, deletedAt: null } }),
    db.product.updateMany({ where: { id: { in: tierIdsToRestore } }, data: { status, deletedAt: null } }),
  ]);

  return { eventId, status, tiersRestored: tierIdsToRestore.length, ticketsSold };
}
