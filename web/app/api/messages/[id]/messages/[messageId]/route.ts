import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { deleteMessage } from "@/lib/messages";
import { messageErrorResponse } from "@/lib/messages/http";

// Delete for everyone — the sender's own messages only.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, messageId } = await params;
    await deleteMessage(id, user.id, messageId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return messageErrorResponse(err);
  }
}
