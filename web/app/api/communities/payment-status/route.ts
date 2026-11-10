import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Polled by app/(app)/communities/callback after a membership checkout,
// keyed by the Payment's processorRef.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const ref = req.nextUrl.searchParams.get("ref");
    if (!ref) return NextResponse.json({ error: "Missing ref" }, { status: 400 });
    const payment = await db.payment.findUnique({
      where: { processorRef: ref },
      select: { status: true, membershipUserId: true, membershipGroupId: true },
    });
    if (!payment || payment.membershipUserId !== user.id || !payment.membershipGroupId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const group = await db.fanbaseGroup.findUnique({ where: { id: payment.membershipGroupId }, select: { id: true, name: true } });
    return NextResponse.json({ status: payment.status, community: group });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
