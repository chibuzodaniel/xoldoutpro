import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getWalletBalances } from "@/lib/commerce/ledger";
import { initiateTransfer } from "@/lib/flutterwave";

const bodySchema = z.object({
  amountKobo: z.number().int().positive(),
  payoutAccountId: z.string().min(1),
});

// PRD §13: fee disclosed before confirmation (0 — platform absorbs it, per
// DECISIONS.md), net receivable always shown, amount can never exceed
// available balance. The debit is recorded immediately on initiation, not
// when Flutterwave finishes the transfer, so the same available balance can
// never be withdrawn twice while a transfer is in flight.
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { amountKobo, payoutAccountId } = bodySchema.parse(await req.json());

    const account = await db.payoutAccount.findUnique({ where: { id: payoutAccountId } });
    if (!account || account.userId !== user.id) {
      return NextResponse.json({ error: "Payout account not found" }, { status: 404 });
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
      const transfer = await initiateTransfer({
        reference: payout.id,
        accountNumber: account.accountNumber,
        bankCode: account.bankCode,
        amountKobo: netKobo,
        narration: "XOLDOUT payout",
      });
      await db.payout.update({ where: { id: payout.id }, data: { processorRef: String(transfer.id) } });
    } catch (err) {
      // Transfer failed to even initiate — reverse the debit so the funds
      // aren't stuck in limbo, and mark the payout FAILED.
      console.error(err);
      await db.$transaction([
        db.payout.update({ where: { id: payout.id }, data: { status: "FAILED" } }),
        db.walletLedgerEntry.create({
          data: { userId: user.id, amountKobo, kind: "PAYOUT_DEBIT", status: "AVAILABLE", payoutId: payout.id },
        }),
      ]);
      return NextResponse.json({ error: "Could not start the transfer. Your balance has been restored." }, { status: 502 });
    }

    return NextResponse.json({ payout }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
