import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, getOptionalUser, AuthError } from "@/lib/auth/session";
import { getWalletBalances } from "@/lib/commerce/ledger";
import {
  buyXgWithWallet,
  createCoinTopUpCheckout,
  InsufficientWalletError,
  InvalidTopUpPackError,
  XG_TOPUP_PACKS,
} from "@/lib/live/coins";

// GET: the packs, plus the caller's available wallet balance when signed in
// (so the sheet can offer "Pay from wallet").
export async function GET(req: NextRequest) {
  const viewer = await getOptionalUser(req).catch(() => null);
  const walletKobo = viewer ? (await getWalletBalances(viewer.id)).availableKobo : null;
  return NextResponse.json({ packs: XG_TOPUP_PACKS, walletKobo });
}

// POST { packIndex, payWith?: "card" | "wallet" } — card opens a Bachs
// checkout as before; wallet pays straight from the wallet balance
// (explicit ask, 2026-10-08) and credits the XG immediately.
const bodySchema = z.object({
  packIndex: z.number().int().min(0).max(XG_TOPUP_PACKS.length - 1),
  payWith: z.enum(["card", "wallet"]).default("card"),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { packIndex, payWith } = bodySchema.parse(await req.json());

    if (payWith === "wallet") {
      const bought = await buyXgWithWallet(user.id, packIndex);
      return NextResponse.json({ paid: "wallet", ...bought }, { status: 201 });
    }

    const result = await createCoinTopUpCheckout({
      userId: user.id,
      packIndex,
      origin: req.nextUrl.origin,
      customerEmail: user.email,
      customerName: user.displayName,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    if (err instanceof InvalidTopUpPackError) return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
    if (err instanceof InsufficientWalletError) {
      return NextResponse.json({ error: "Not enough in your wallet for this pack", insufficientWallet: true }, { status: 402 });
    }
    console.error(err);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 502 });
  }
}
