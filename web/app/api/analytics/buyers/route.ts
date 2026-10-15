import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getSellerSales } from "@/lib/commerce/sellerSales";

// The signed-in seller's own buyer list (explicit ask, 2026-10-15) — who
// bought, refunds and why, and plays/downloads for music and beats. Same
// data the moderator user detail view shows, minus amounts: Analytics
// carries no Naira (PRD §13 — that's Wallet's job). Fetched once on page
// open, never polled.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { summary, sales, buyers } = await getSellerSales(user.id);
    return NextResponse.json({
      summary,
      sales: sales.map((s) => ({ ...s, amountKobo: undefined })),
      buyers: buyers.map((b) => ({ ...b, spentKobo: undefined })),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
