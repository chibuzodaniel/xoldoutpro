import { db } from "@/lib/db";

// Events marketplace rules (explicit ask, 2026-11-11), shared by checkout
// (app/api/orders) and the host dashboard so the two can't drift.

export { LINEUP_ROLES, LINEUP_ROLE_LABEL, type LineupRole } from "@/lib/event/lineupRules";

/** Orders that count as a use of a discount / toward a ticket limit: paid, or still in checkout. */
const LIVE_ORDER = { in: ["PAID", "PENDING"] as ("PAID" | "PENDING")[] };

export class MarketplaceError extends Error {}

/**
 * Per-buyer ticket limits: the event-wide limit and this ticket type's own.
 * Counts tickets the buyer already holds plus ones in a checkout that hasn't
 * finished, so splitting into several orders can't get round it.
 */
export async function assertTicketLimit(args: { buyerId: string; eventId: string; tierProductId: string; quantity: number }) {
  const event = await db.event.findUnique({
    where: { id: args.eventId },
    select: { maxPerBuyer: true, tiers: { select: { productId: true, maxPerBuyer: true, name: true } } },
  });
  if (!event) return;
  const tier = event.tiers.find((t) => t.productId === args.tierProductId);
  if (event.maxPerBuyer == null && tier?.maxPerBuyer == null) return;

  const tierIds = event.tiers.map((t) => t.productId);
  const [held, pending] = await Promise.all([
    db.entitlement.groupBy({ by: ["productId"], where: { userId: args.buyerId, productId: { in: tierIds }, revokedAt: null }, _count: { _all: true } }),
    db.orderItem.groupBy({
      by: ["productId"],
      where: { productId: { in: tierIds }, order: { buyerId: args.buyerId, status: "PENDING" } },
      _sum: { quantity: true },
    }),
  ]);
  const countFor = (pid: string) => (held.find((h) => h.productId === pid)?._count._all ?? 0) + (pending.find((p) => p.productId === pid)?._sum.quantity ?? 0);

  if (tier?.maxPerBuyer != null) {
    const have = countFor(tier.productId);
    if (have + args.quantity > tier.maxPerBuyer) {
      const left = Math.max(0, tier.maxPerBuyer - have);
      throw new MarketplaceError(
        left === 0
          ? `You've reached the limit of ${tier.maxPerBuyer} ${tier.name} ticket${tier.maxPerBuyer === 1 ? "" : "s"} per person`
          : `You can get ${left} more ${tier.name} ticket${left === 1 ? "" : "s"} (limit ${tier.maxPerBuyer} per person)`,
      );
    }
  }
  if (event.maxPerBuyer != null) {
    const have = tierIds.reduce((n, pid) => n + countFor(pid), 0);
    if (have + args.quantity > event.maxPerBuyer) {
      const left = Math.max(0, event.maxPerBuyer - have);
      throw new MarketplaceError(
        left === 0
          ? `You've reached the limit of ${event.maxPerBuyer} ticket${event.maxPerBuyer === 1 ? "" : "s"} per person for this event`
          : `You can get ${left} more ticket${left === 1 ? "" : "s"} for this event (limit ${event.maxPerBuyer} per person)`,
      );
    }
  }
}

type DiscountRow = { id: string; name: string; code: string | null; kind: string; value: number; startsAt: Date | null; expiresAt: Date | null; maxUses: number | null; tierIds: string[]; active: boolean; isEarlyBird: boolean };

function discountedUnit(d: Pick<DiscountRow, "kind" | "value">, unitKobo: number) {
  if (d.kind === "PERCENT") return Math.max(0, Math.round((unitKobo * (100 - Math.min(100, d.value))) / 100));
  return Math.max(0, unitKobo - d.value);
}

/** Why a discount can't be used right now, or null. Usage = paid or in-checkout orders. */
async function unusableReason(d: DiscountRow, tierProductId: string, now = new Date()) {
  if (!d.active) return "This code isn't active";
  if (d.startsAt && d.startsAt > now) return "This code isn't active yet";
  if (d.expiresAt && d.expiresAt <= now) return "This code has expired";
  if (d.tierIds.length && !d.tierIds.includes(tierProductId)) return "This code doesn't apply to this ticket type";
  if (d.maxUses != null) {
    const used = await db.order.count({ where: { discountId: d.id, status: LIVE_ORDER } });
    if (used >= d.maxUses) return "This code has been fully used";
  }
  return null;
}

/**
 * The discount for this checkout: the code the buyer typed (must be valid),
 * else the best automatic offer (early-bird) that applies. Returns the new
 * unit price and how much was taken off in total.
 */
export async function resolveEventDiscount(args: { eventId: string; tierProductId: string; unitPriceKobo: number; quantity: number; code?: string | null }) {
  if (args.unitPriceKobo <= 0) return null;
  const code = args.code?.trim().toUpperCase() || null;
  if (code) {
    const d = await db.eventDiscount.findUnique({ where: { eventId_code: { eventId: args.eventId, code } } });
    if (!d) throw new MarketplaceError("That discount code isn't valid for this event");
    const reason = await unusableReason(d, args.tierProductId);
    if (reason) throw new MarketplaceError(reason);
    const unit = discountedUnit(d, args.unitPriceKobo);
    return { discount: d, unitPriceKobo: unit, discountKobo: (args.unitPriceKobo - unit) * args.quantity };
  }
  const autos = await db.eventDiscount.findMany({ where: { eventId: args.eventId, code: null, active: true } });
  let best: { discount: DiscountRow; unitPriceKobo: number; discountKobo: number } | null = null;
  for (const d of autos) {
    if (await unusableReason(d, args.tierProductId)) continue;
    const unit = discountedUnit(d, args.unitPriceKobo);
    if (!best || unit < best.unitPriceKobo) best = { discount: d, unitPriceKobo: unit, discountKobo: (args.unitPriceKobo - unit) * args.quantity };
  }
  return best;
}

/** Public preview for the "Use discount code" box. */
export async function previewDiscount(args: { eventId: string; tierProductId: string; code: string }) {
  const tier = await db.ticketTier.findUnique({ where: { productId: args.tierProductId }, select: { eventId: true, product: { select: { priceKobo: true } } } });
  if (!tier || tier.eventId !== args.eventId) throw new MarketplaceError("Pick a ticket type");
  const r = await resolveEventDiscount({ eventId: args.eventId, tierProductId: args.tierProductId, unitPriceKobo: tier.product.priceKobo, quantity: 1, code: args.code });
  if (!r) throw new MarketplaceError("That discount code isn't valid for this event");
  return { name: r.discount.name, kind: r.discount.kind, value: r.discount.value, unitPriceKobo: r.unitPriceKobo };
}

/**
 * The promoter's pay for this checkout, fixed now (2026-11-11): the host's
 * choice of % of what the buyer pays for the tickets (after discounts, no
 * service charge) or a flat amount per ticket. Independent of the platform fee.
 */
export function promoterCommissionFor(args: { payType: string; sharePercent: number; flatKobo: number; ticketSubtotalKobo: number; quantity: number }) {
  if (args.ticketSubtotalKobo <= 0) return 0;
  if (args.payType === "FLAT") return Math.min(args.ticketSubtotalKobo, Math.max(0, args.flatKobo) * args.quantity);
  return Math.round((args.ticketSubtotalKobo * Math.min(100, Math.max(0, args.sharePercent))) / 100);
}
