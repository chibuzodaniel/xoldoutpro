import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/session";
import { requireModeratorPanel } from "@/lib/moderation/panelAccess";
import { getUserModerationDetail } from "@/lib/commerce/userModeration";

// View-only (explicit ask, 2026-09-22 — user chose "view only" over adding a
// manual wallet-adjustment capability): no PATCH here, ever. Money
// corrections stay confined to the dedicated recompute tools.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireModeratorPanel(req, "userDetails");
    const { id } = await params;
    const detail = await getUserModerationDetail(id);
    if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
