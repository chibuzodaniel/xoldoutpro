import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/session";
import { requireModeratorPanel } from "@/lib/moderation/panelAccess";
import { db } from "@/lib/db";
import { takedownProduct } from "@/lib/commerce/productModeration";

// General-purpose "take this product down, for any reason" — same
// refund-and-revoke mechanics as the copyright-report-only path
// (app/api/reports/[id]/route.ts), just reachable directly from the
// moderator dashboard's product panel instead of requiring someone to have
// filed a report first (explicit ask). A dedicated action route rather than
// DELETE, since DELETE already means something weaker elsewhere in this
// codebase (a creator's own soft-delete — no refunds, no revocation).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireModeratorPanel(req, "productTakedown");
    const { id } = await params;

    const product = await db.product.findUnique({ where: { id } });
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (product.status === "DELETED") return NextResponse.json({ error: "Already taken down" }, { status: 409 });

    const { refundFailures } = await takedownProduct(id);
    return NextResponse.json({ ok: true, refundFailures });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Could not take down product" }, { status: 500 });
  }
}
