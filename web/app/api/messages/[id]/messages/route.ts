import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { sendMessage } from "@/lib/messages";
import { messageErrorResponse, outgoingSchema } from "@/lib/messages/http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const message = outgoingSchema.parse(await req.json());
    return NextResponse.json(await sendMessage(id, user.id, message), { status: 201 });
  } catch (err) {
    return messageErrorResponse(err);
  }
}
