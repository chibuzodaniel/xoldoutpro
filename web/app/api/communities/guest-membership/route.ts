import { NextRequest, NextResponse } from "next/server";
import { getGuestMembershipView } from "@/lib/communities/guestJoin";

// The welcome page's view of a guest membership, by its claim token (the
// success page has it from checkout; the email link carries it). Polled
// while the payment is being confirmed.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const view = await getGuestMembershipView(token);
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
