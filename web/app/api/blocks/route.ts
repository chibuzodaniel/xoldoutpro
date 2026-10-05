import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { setBlocked } from "@/lib/messages";
import { messageErrorResponse } from "@/lib/messages/http";

// Block / unblock someone (direct messages): POST { userId, blocked }.
const bodySchema = z.object({ userId: z.string().min(1), blocked: z.boolean() });

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { userId, blocked } = bodySchema.parse(await req.json());
    await setBlocked(user.id, userId, blocked);
    return NextResponse.json({ ok: true, blocked });
  } catch (err) {
    return messageErrorResponse(err);
  }
}
