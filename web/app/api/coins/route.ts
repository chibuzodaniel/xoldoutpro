import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getCoinBalance } from "@/lib/live/coins";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const balanceXg = await getCoinBalance(user.id);
    return NextResponse.json({ balanceXg });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
