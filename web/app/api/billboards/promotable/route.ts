import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { listPromotableItems } from "@/lib/commerce/billboards";

// The billboard "what should this link to?" picker on app/(app)/billboards —
// the creator's own published songs, beats, merch and events.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    return NextResponse.json({ items: await listPromotableItems(user.id) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
