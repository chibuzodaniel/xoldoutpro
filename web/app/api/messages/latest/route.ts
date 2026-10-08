import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { latestIncoming, unreadSummary } from "@/lib/messages";
import { pendingInviteFor } from "@/lib/live/battle";
import { messageErrorResponse } from "@/lib/messages/http";

// GET ?since=<iso> — new incoming direct messages for the in-app banner
// (lib/messages latestIncoming). Polled every 30s while the app is open, so
// it works even where push isn't available.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const sinceParam = req.nextUrl.searchParams.get("since");
    const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 60_000);
    const safeSince = Number.isNaN(since.getTime()) ? new Date(Date.now() - 60_000) : since;
    // The badge numbers ride along, so the header doesn't need a poll of
    // its own (Vercel CPU, 2026-10-06).
    // A battle invite still ringing rides along too (one indexed lookup), so
    // the ring shows even when the push didn't arrive.
    const [messages, unread, battleInvite] = await Promise.all([
      latestIncoming(user.id, safeSince),
      unreadSummary(user.id),
      pendingInviteFor(user.id).catch(() => null),
    ]);
    return NextResponse.json({ messages, unread, battleInvite, serverTime: new Date().toISOString() });
  } catch (err) {
    return messageErrorResponse(err);
  }
}
