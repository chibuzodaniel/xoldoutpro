import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { acceptRequest, getThread, hideConversation, proposeDisappearing, respondDisappearing } from "@/lib/messages";
import { messageErrorResponse } from "@/lib/messages/http";

// GET ?after=<iso> — the conversation (only newer messages when `after` is
// given, for refreshing). Opening it marks it read.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const afterParam = req.nextUrl.searchParams.get("after");
    const after = afterParam ? new Date(afterParam) : undefined;
    return NextResponse.json(await getThread(id, user.id, after && !Number.isNaN(after.getTime()) ? after : undefined));
  } catch (err) {
    return messageErrorResponse(err);
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("hide") }),
  z.object({ action: z.literal("disappear-propose"), seconds: z.number().int().min(0) }),
  z.object({ action: z.literal("disappear-respond"), approve: z.boolean() }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const body = actionSchema.parse(await req.json());
    if (body.action === "accept") await acceptRequest(id, user.id);
    else if (body.action === "hide") await hideConversation(id, user.id);
    else if (body.action === "disappear-propose") await proposeDisappearing(id, user.id, body.seconds);
    else await respondDisappearing(id, user.id, body.approve);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return messageErrorResponse(err);
  }
}
