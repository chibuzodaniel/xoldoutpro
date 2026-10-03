import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Polled by app/(app)/live/coins/checkout-callback/page.tsx — same "poll
// until the webhook has caught up" shape as the Billboard checkout callback,
// keyed by processorRef (there's no dedicated top-up entity id to poll, see
// lib/live/coins.ts's Payment.coinTopUpUserId comment).
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const ref = req.nextUrl.searchParams.get("ref");
    if (!ref) return NextResponse.json({ error: "Missing ref" }, { status: 400 });

    const payment = await db.payment.findUnique({ where: { processorRef: ref } });
    if (!payment || payment.coinTopUpUserId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ status: payment.status, xgAmount: payment.coinTopUpXgAmount });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
