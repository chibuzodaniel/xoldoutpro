import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { unreadSummary } from "@/lib/messages";
import { messageErrorResponse } from "@/lib/messages/http";

// The Messages icon's badge: conversations with unread messages + requests.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    return NextResponse.json(await unreadSummary(user.id));
  } catch (err) {
    return messageErrorResponse(err);
  }
}
