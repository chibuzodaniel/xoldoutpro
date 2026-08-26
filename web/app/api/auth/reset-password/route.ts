import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth } from "@/lib/firebase/admin";
import { sendPasswordResetEmail } from "@/lib/email";

const bodySchema = z.object({ email: z.string().trim().email() });

// Deliberately unauthenticated — this is how a signed-out user recovers
// access in the first place. Always responds 200 with the same shape
// regardless of whether the email is registered (mirrors the client-side
// masking LoginForm used to do itself with Firebase's auth/user-not-found),
// so this endpoint can't be used to check which emails have accounts.
export async function POST(req: NextRequest) {
  try {
    const { email } = bodySchema.parse(await req.json());

    let emailSent = false;
    try {
      const resetLink = await adminAuth().generatePasswordResetLink(email);
      emailSent = await sendPasswordResetEmail({ to: email, resetLink });
    } catch (err) {
      // auth/user-not-found (or a malformed-but-schema-valid address Firebase
      // rejects) — treated exactly like "we sent it" so the response can't be
      // used to enumerate registered emails.
      if (!(err instanceof Error && "code" in err && err.code === "auth/user-not-found")) {
        console.error("[reset-password] generatePasswordResetLink failed", err);
      }
    }

    return NextResponse.json({ ok: true, emailSent });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
