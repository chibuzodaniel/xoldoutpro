import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { listConversations, sendToUser } from "@/lib/messages";
import { messageErrorResponse, outgoingSchema } from "@/lib/messages/http";

// GET ?box=inbox|requests — the caller's conversation list.
// POST { toUserId, message } — start (or continue) a conversation with someone.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const box = req.nextUrl.searchParams.get("box") === "requests" ? "requests" : "inbox";
    return NextResponse.json({ conversations: await listConversations(user.id, box) });
  } catch (err) {
    return messageErrorResponse(err);
  }
}

const postSchema = z.object({ toUserId: z.string().min(1), message: outgoingSchema });

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { toUserId, message } = postSchema.parse(await req.json());
    return NextResponse.json(await sendToUser(user.id, toUserId, message), { status: 201 });
  } catch (err) {
    return messageErrorResponse(err);
  }
}
