import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getWalletBalances } from "@/lib/commerce/ledger";
import { MINIMUM_WITHDRAWAL_KOBO } from "@/lib/commerce/constants";
import { initiatePayout } from "@/lib/bachs";
import { createNotification } from "@/lib/notifications/create";

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

const bodySchema = z.object({
  amountKobo: z.number().int().positive(),
  payoutAccountId: z.string().min(1),
});

// PRD §13: fee disclosed before confirmation (0 — platform absorbs it, per
// DECISIONS.md), net receivable always shown, amount can never exceed
// available balance. The debit is recorded immediately on initiation, not
// when Bachs finishes the payout, so the same available balance can never
// be withdrawn twice while one is in flight.
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { amountKobo, payoutAccountId } = bodySchema.parse(await req.json());

    const account = await db.payoutAccount.findUnique({ where: { id: payoutAccountId } });
    if (!account || account.userId !== user.id) {
      return NextResponse.json({ error: "Payout account not found" }, { status: 404 });
    }
    // A row added under the old Flutterwave flow (or one still under Bachs's
    // own review — see lib/bachs.ts's createPayoutDestination) has no usable
    // Bachs destination to pay out to yet.
    if (!account.payoutDestinationId || !account.payoutDestinationUsable) {
      return NextResponse.json(
        { error: "This bank account needs to be re-added before you can withdraw to it." },
        { status: 400 },
      );
    }

    if (amountKobo < MINIMUM_WITHDRAWAL_KOBO) {
      return NextResponse.json({ error: `The minimum withdrawal is ${formatNaira(MINIMUM_WITHDRAWAL_KOBO)}` }, { status: 400 });
    }

    const { availableKobo } = await getWalletBalances(user.id);
    if (amountKobo > availableKobo) {
      return NextResponse.json({ error: "Amount exceeds available balance" }, { status: 400 });
    }

    const feeKobo = 0; // platform absorbs the withdrawal fee (DECISIONS.md)
    const netKobo = amountKobo - feeKobo;

    const payout = await db.$transaction(async (tx) => {
      const created = await tx.payout.create({
        data: { userId: user.id, amountKobo, feeKobo, netKobo, payoutAccountId, status: "PROCESSING" },
      });
      await tx.walletLedgerEntry.create({
        data: {
          userId: user.id,
          amountKobo: -amountKobo,
          kind: "PAYOUT_DEBIT",
          status: "AVAILABLE",
          payoutId: created.id,
        },
      });
      return created;
    });

    try {
      const transfer = await initiatePayout({
        destinationId: account.payoutDestinationId,
        amountKobo: netKobo,
        reference: payout.id,
      });
      await db.payout.update({ where: { id: payout.id }, data: { processorRef: transfer.id } });
    } catch (err) {
      // Payout failed to even initiate — reverse the debit so the funds
      // aren't stuck in limbo, and mark the payout FAILED.
      console.error(err);
      await db.$transaction([
        db.payout.update({ where: { id: payout.id }, data: { status: "FAILED" } }),
        db.walletLedgerEntry.create({
          data: { userId: user.id, amountKobo, kind: "PAYOUT_DEBIT", status: "AVAILABLE", payoutId: payout.id },
        }),
      ]);
      await createNotification(user.id, {
        kind: "PAYOUT_FAILED",
        title: "Withdrawal failed",
        body: `${formatNaira(netKobo)} could not be sent — your balance has been restored.`,
        url: "/wallet",
      });
      return NextResponse.json({ error: "Could not start the transfer. Your balance has been restored." }, { status: 502 });
    }

    await createNotification(user.id, {
      kind: "PAYOUT_INITIATED",
      title: "Withdrawal started",
      body: `${formatNaira(netKobo)} is on its way to your bank.`,
      url: "/wallet",
    });

    return NextResponse.json({ payout }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
