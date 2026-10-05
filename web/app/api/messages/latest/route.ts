import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { latestIncoming } from "@/lib/messages";
import { messageErrorResponse } from "@/lib/messages/http";

// GET ?since=<iso> — new incoming direct messages for the in-app banner
// (lib/messages latestIncoming). Polled every few seconds while the app is
// open, so it works even where push isn't available.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const sinceParam = req.nextUrl.searchParams.get("since");
    const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 60_000);
    const safeSince = Number.isNaN(since.getTime()) ? new Date(Date.now() - 60_000) : since;
    return NextResponse.json({ messages: await latestIncoming(user.id, safeSince), serverTime: new Date().toISOString() });
  } catch (err) {
    return messageErrorResponse(err);
  }
}
