import { NextRequest, NextResponse } from "next/server";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { getPlatformFinancials } from "@/lib/commerce/ledger";

// Moderator-only platform-wide financial overview — see
// getPlatformFinancials's own comment for exactly what each figure means
// and why (revenue vs. net income vs. owing vs. paid aren't the same thing
// and are easy to conflate).
export async function GET(req: NextRequest) {
  try {
    await requireModerator(req);
    const financials = await getPlatformFinancials();
    return NextResponse.json(financials);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
