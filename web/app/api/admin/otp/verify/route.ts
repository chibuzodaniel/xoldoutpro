import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { verifyModeratorOtp } from "@/lib/auth/moderatorOtp";

const bodySchema = z.object({ code: z.string().length(6) });

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireModerator(req);
    const { code } = bodySchema.parse(await req.json());

    const result = await verifyModeratorOtp(user.id, code);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 401 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Enter all 6 digits" }, { status: 400 });
    throw err;
  }
}
