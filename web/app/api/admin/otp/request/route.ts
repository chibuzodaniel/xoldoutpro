import { NextRequest, NextResponse } from "next/server";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { issueModeratorOtp } from "@/lib/auth/moderatorOtp";
import { sendModeratorOtpEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireModerator(req);
    const code = await issueModeratorOtp(user.id);
    const emailSent = await sendModeratorOtpEmail({ to: user.email, displayName: user.displayName, code });
    return NextResponse.json({ ok: true, emailSent });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Could not send code" }, { status: 500 });
  }
}
