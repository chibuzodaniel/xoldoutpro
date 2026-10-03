import { db } from "@/lib/db";
import { alertModerators } from "@/lib/moderation/attention";
import { initializePayment, initiateRefund } from "@/lib/bachs";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Moderator-configurable price for one day of the Discover billboard rail
 * (SiteControlsPanel, PATCH /api/admin/settings). Lazy singleton read, same
 * pattern as lib/audio/serveDownload.ts's downloadsEnabled().
 */
export async function getBillboardDailyRateKobo(): Promise<number> {
  const row = await db.platformSettings.findUnique({ where: { id: "singleton" } });
  return row?.billboardDailyRateKobo ?? 500_000;
}

/**
 * A creator can only ever have one billboard live, paid-and-awaiting-review,
 * or awaiting payment at a time (explicit ask: "they can only upload one
 * artwork there"). Computed at read time from status+expiresAt, not swept —
 * same philosophy as getWalletBalances' available/pending split.
 */
export async function getBlockingBillboardForCreator(creatorId: string) {
  return db.billboard.findFirst({
    where: {
      creatorId,
      OR: [
        { status: "PENDING_PAYMENT" },
        { status: "PENDING_REVIEW" },
        { status: "ACTIVE", expiresAt: { gt: new Date() } },
      ],
    },
  });
}

export type BillboardTarget =
  | { kind: "RELEASE" | "BEAT" | "MERCH" | "EVENT"; id: string; title: string }
  | { kind: "PROFILE"; handle: string }
  | null;

/** One rail slide, shared by web (href) and mobile (target → its own screens) via GET /api/billboards/active. */
export type BillboardSlideData = {
  id: string;
  artworkUrl: string;
  viewCount: number;
  creator: { handle: string; displayName: string } | null;
  href: string | null;
  target: BillboardTarget;
};

export async function getActiveBillboards(): Promise<BillboardSlideData[]> {
  const rows = await getActiveBillboardRows();
  return rows.map((b) => {
    let target: BillboardTarget = b.creator ? { kind: "PROFILE", handle: b.creator.handle } : null;
    if (b.event && b.event.status === "PUBLISHED") target = { kind: "EVENT", id: b.event.id, title: b.event.title };
    else if (b.product && b.product.status === "PUBLISHED" && b.product.type !== "EVENT") {
      target = { kind: b.product.type, id: b.product.id, title: b.product.title };
    }
    return { id: b.id, artworkUrl: b.artworkUrl, viewCount: b.viewCount, creator: b.creator, href: billboardHref(b), target };
  });
}

async function getActiveBillboardRows() {
  return db.billboard.findMany({
    where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    select: {
      id: true,
      artworkUrl: true,
      viewCount: true,
      creator: { select: { handle: true, displayName: true } },
      product: { select: { id: true, type: true, title: true, status: true } },
      event: { select: { id: true, title: true, status: true } },
    },
    orderBy: { activatedAt: "asc" },
  });
}

// ─── Promoted item (song / beat / merch / event) ────────────────────────

export type PromotedKind = "RELEASE" | "BEAT" | "MERCH" | "EVENT";
export type PromotedRef = { kind: PromotedKind; id: string };

export class InvalidPromotedItemError extends Error {}

/**
 * Resolves a creator-chosen "promote this" pick to Billboard's productId/
 * eventId columns. Only the creator's own PUBLISHED items are allowed — a
 * billboard must never send traffic to someone else's product or a draft.
 * null clears it (billboard links to the creator's profile, the original
 * behavior).
 */
export async function resolvePromotedItem(creatorId: string, ref: PromotedRef | null): Promise<{ productId: string | null; eventId: string | null }> {
  if (!ref) return { productId: null, eventId: null };
  if (ref.kind === "EVENT") {
    const event = await db.event.findUnique({ where: { id: ref.id }, select: { creatorId: true, status: true } });
    if (!event || event.creatorId !== creatorId || event.status !== "PUBLISHED") throw new InvalidPromotedItemError();
    return { productId: null, eventId: ref.id };
  }
  const product = await db.product.findUnique({ where: { id: ref.id }, select: { creatorId: true, status: true, type: true } });
  if (!product || product.creatorId !== creatorId || product.status !== "PUBLISHED" || product.type !== ref.kind) {
    throw new InvalidPromotedItemError();
  }
  return { productId: ref.id, eventId: null };
}

/** The creator's own published songs/beats/merch/events — the billboard "promote" picker. */
export async function listPromotableItems(creatorId: string): Promise<{ kind: PromotedKind; id: string; title: string }[]> {
  const [products, events] = await Promise.all([
    db.product.findMany({
      where: { creatorId, status: "PUBLISHED", type: { in: ["RELEASE", "BEAT", "MERCH"] } },
      select: { id: true, type: true, title: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.event.findMany({
      where: { creatorId, status: "PUBLISHED" },
      select: { id: true, title: true },
      orderBy: { startsAt: "desc" },
      take: 50,
    }),
  ]);
  return [
    ...products.map((p) => ({ kind: p.type as PromotedKind, id: p.id, title: p.title })),
    ...events.map((e) => ({ kind: "EVENT" as const, id: e.id, title: e.title })),
  ];
}

/**
 * Where tapping a billboard goes: its promoted item if one is set and still
 * published, otherwise the creator's profile (or nowhere, for a
 * moderator-added billboard with no creator).
 */
export function billboardHref(b: {
  creator: { handle: string } | null;
  product: { id: string; type: string; status: string } | null;
  event: { id: string; status: string } | null;
}): string | null {
  if (b.event && b.event.status === "PUBLISHED") return `/e/${b.event.id}`;
  if (b.product && b.product.status === "PUBLISHED") {
    if (b.product.type === "BEAT") return `/b/${b.product.id}`;
    if (b.product.type === "MERCH") return `/m/${b.product.id}`;
    return `/r/${b.product.id}`;
  }
  return b.creator ? `/u/${b.creator.handle}` : null;
}

/** Max impressions one beacon may add per billboard — a rotating rail shows each slide every few seconds, so anything far above this is a forged request, not a real viewer. */
export const MAX_VIEWS_PER_BEACON = 50;

/** Batched impression counts from BillboardRail (POST /api/billboards/views). Only counts toward currently-active billboards. */
export async function addBillboardViews(counts: Record<string, number>): Promise<void> {
  const entries = Object.entries(counts)
    .map(([id, n]) => [id, Math.min(Math.max(Math.floor(n), 0), MAX_VIEWS_PER_BEACON)] as const)
    .filter(([, n]) => n > 0);
  if (entries.length === 0) return;
  await db.$transaction(
    entries.map(([id, n]) =>
      db.billboard.updateMany({
        where: { id, status: "ACTIVE", expiresAt: { gt: new Date() } },
        data: { viewCount: { increment: n } },
      }),
    ),
  );
}

class BillboardConflictError extends Error {}
export { BillboardConflictError };

// Sane bounds on the creator-chosen duration — the moderator "extend" action
// (PATCH /api/admin/billboards/[id]) is uncapped and is the escape hatch for
// anything longer than this.
export const MIN_BILLBOARD_DAYS = 1;
export const MAX_BILLBOARD_DAYS = 90;

/**
 * Starts a paid billboard purchase: debits the wallet immediately if it
 * covers the full days*rate total, otherwise starts a real Bachs checkout
 * for the full amount (explicit ask: wallet first, Bachs "if they don't
 * have enough") — never a partial wallet + partial Bachs split, which would
 * need its own reconciliation machinery nothing else in this app has.
 *
 * Either way, payment only ever lands the billboard in PENDING_REVIEW —
 * paying doesn't put it live. A moderator has to approve it first
 * (approveBillboard) — explicit ask: "moderators too should approve every
 * billboard posted before it goes live."
 */
export async function createBillboardCheckout(args: {
  creatorId: string;
  artworkUrl: string;
  days: number;
  origin: string;
  customerEmail: string;
  customerName: string;
  // Already validated via resolvePromotedItem by the caller.
  promoted?: { productId: string | null; eventId: string | null };
}): Promise<
  | { mode: "wallet"; billboard: { id: string } }
  | { mode: "bachs"; billboard: { id: string }; checkoutUrl: string }
> {
  const existing = await getBlockingBillboardForCreator(args.creatorId);
  if (existing) throw new BillboardConflictError();

  const days = Math.min(Math.max(Math.round(args.days), MIN_BILLBOARD_DAYS), MAX_BILLBOARD_DAYS);
  const totalKobo = (await getBillboardDailyRateKobo()) * days;

  const walletResult = await db.$transaction(async (tx) => {
    // Advisory lock keyed on the creator id — same technique as
    // app/api/wallet/withdraw/route.ts, since there's no mutable balance
    // row to lock and two near-simultaneous purchase attempts could
    // otherwise both read the same pre-debit balance.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${args.creatorId}))`;

    const available = await tx.walletLedgerEntry.aggregate({
      where: { userId: args.creatorId, OR: [{ availableAt: null }, { availableAt: { lte: new Date() } }] },
      _sum: { amountKobo: true },
    });
    const availableKobo = available._sum.amountKobo ?? 0;
    if (availableKobo < totalKobo) return null;

    const billboard = await tx.billboard.create({
      data: {
        creatorId: args.creatorId,
        artworkUrl: args.artworkUrl,
        status: "PENDING_REVIEW",
        days,
        paidKobo: totalKobo,
        productId: args.promoted?.productId ?? null,
        eventId: args.promoted?.eventId ?? null,
      },
    });
    await tx.walletLedgerEntry.create({
      data: {
        userId: args.creatorId,
        amountKobo: -totalKobo,
        kind: "BILLBOARD_FEE",
        status: "AVAILABLE",
        billboardId: billboard.id,
      },
    });
    return billboard;
  });

  if (walletResult) {
    alertModerators({ panel: "billboards", title: "Billboard awaiting review", body: "A paid billboard is waiting for approval." });
    return { mode: "wallet", billboard: { id: walletResult.id } };
  }

  const billboard = await db.billboard.create({
    data: {
      creatorId: args.creatorId,
      artworkUrl: args.artworkUrl,
      status: "PENDING_PAYMENT",
      days,
      productId: args.promoted?.productId ?? null,
      eventId: args.promoted?.eventId ?? null,
    },
  });
  await db.payment.create({
    data: { billboardId: billboard.id, processor: "bachs", processorRef: billboard.id, amountKobo: totalKobo, status: "INITIATED" },
  });
  const checkoutUrl = await initializePayment({
    txRef: billboard.id,
    amountKobo: totalKobo,
    customerEmail: args.customerEmail,
    customerName: args.customerName,
    redirectUrl: `${args.origin}/billboards/checkout-callback`,
    title: `XOLDOUT Billboard — ${days} day${days === 1 ? "" : "s"}`,
  });
  return { mode: "bachs", billboard: { id: billboard.id }, checkoutUrl };
}

type PaymentForBillboard = { id: string; billboardId: string | null; amountKobo: number };
type VerifiedResult = { id: number | string; status: "successful" | "failed" | string; amountKobo: number };

/**
 * Sibling of lib/commerce/confirmPayment.ts's finalizePayment, for the
 * Billboard/Bachs branch of the same webhook — deliberately not reusing
 * that function, since it's deeply wired to Order/entitlement/stock/ticket
 * concerns a billboard purchase has none of. A successful payment lands the
 * billboard in PENDING_REVIEW, same as the wallet path — moderator approval
 * still gates going live either way.
 */
export async function finalizeBillboardPayment(
  payment: PaymentForBillboard,
  verified: VerifiedResult,
  rawPayload: unknown,
): Promise<{ alreadyProcessed: boolean }> {
  const claim = await db.payment.updateMany({
    where: { id: payment.id, status: "INITIATED" },
    data: {
      status: verified.status === "successful" ? "SUCCESSFUL" : "FAILED",
      webhookReceivedAt: new Date(),
      rawPayload: rawPayload as never,
      providerTransactionId: String(verified.id),
    },
  });
  if (claim.count === 0) return { alreadyProcessed: true };

  if (!payment.billboardId) return { alreadyProcessed: false };

  if (verified.status !== "successful" || verified.amountKobo !== payment.amountKobo) {
    await db.billboard.update({ where: { id: payment.billboardId }, data: { status: "REMOVED" } });
    return { alreadyProcessed: false };
  }

  await db.billboard.update({
    where: { id: payment.billboardId },
    data: { status: "PENDING_REVIEW", paidKobo: verified.amountKobo },
  });
  alertModerators({ panel: "billboards", title: "Billboard awaiting review", body: "A paid billboard is waiting for approval." });
  return { alreadyProcessed: false };
}

export class BillboardStateError extends Error {}

/** Moderator approval — the only path that ever sets a billboard ACTIVE and starts its clock. */
export async function approveBillboard(billboardId: string, moderatorId: string) {
  const billboard = await db.billboard.findUnique({ where: { id: billboardId } });
  if (!billboard || billboard.status !== "PENDING_REVIEW") throw new BillboardStateError();

  const now = new Date();
  return db.billboard.update({
    where: { id: billboardId },
    data: {
      status: "ACTIVE",
      activatedAt: now,
      expiresAt: new Date(now.getTime() + billboard.days * DAY_MS),
      updatedBy: moderatorId,
    },
  });
}

/**
 * Moderator rejection — always refunds whatever was actually paid (explicit
 * ask), always requires a reason. Wallet-paid billboards get a reversing
 * BILLBOARD_REFUND ledger credit; Bachs-paid ones get a real Bachs refund
 * against the charge captured at webhook time (finalizeBillboardPayment's
 * providerTransactionId).
 */
export async function rejectBillboard(billboardId: string, moderatorId: string, reason: string) {
  const billboard = await db.billboard.findUnique({ where: { id: billboardId }, include: { payment: true } });
  if (!billboard || billboard.status !== "PENDING_REVIEW") throw new BillboardStateError();

  if (billboard.paidKobo > 0 && billboard.creatorId) {
    if (billboard.payment?.processor === "bachs" && billboard.payment.providerTransactionId) {
      await initiateRefund(billboard.payment.providerTransactionId, billboard.paidKobo);
    } else {
      await db.walletLedgerEntry.create({
        data: {
          userId: billboard.creatorId,
          amountKobo: billboard.paidKobo,
          kind: "BILLBOARD_REFUND",
          status: "AVAILABLE",
          billboardId: billboard.id,
        },
      });
    }
  }

  return db.billboard.update({
    where: { id: billboardId },
    data: { status: "REJECTED", rejectionReason: reason, updatedBy: moderatorId },
  });
}
