import { db } from "@/lib/db";
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

export async function getActiveBillboards() {
  return db.billboard.findMany({
    where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    select: {
      id: true,
      artworkUrl: true,
      creator: { select: { handle: true, displayName: true } },
    },
    orderBy: { activatedAt: "asc" },
  });
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
    return { mode: "wallet", billboard: { id: walletResult.id } };
  }

  const billboard = await db.billboard.create({
    data: { creatorId: args.creatorId, artworkUrl: args.artworkUrl, status: "PENDING_PAYMENT", days },
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
