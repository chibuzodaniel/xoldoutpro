import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth } from "@/lib/firebase/admin";
import { sendPasswordResetEmail } from "@/lib/email";

const bodySchema = z.object({ email: z.string().trim().email() });

// handleCodeInApp routes the emailed link straight to our own
// /reset-password page (as ?mode=resetPassword&oobCode=...&apiKey=...)
// instead of Firebase's own hosted action page on the project's Firebase
// Auth domain. Two explicit asks this satisfies together: the link now
// lands on this app's own domain, not a Firebase-branded one; and the
// custom page (app/(auth)/reset-password) only *validates* the code on
// load and *consumes* it on actual form submit, which survives an email
// client's link-safety prescan (a plain GET) the way Firebase's own
// default-hosted flow does not always survive — see that page's own
// comment for the full mechanism.
//
// `url` must be on a domain listed in Firebase Auth's Authorized domains
// (Console → Authentication → Settings) or generatePasswordResetLink
// throws `auth/invalid-continue-uri` — confirm www.xoldout.app is listed
// there before relying on this in production.
const RESET_PASSWORD_URL = "https://www.xoldout.app/reset-password";

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
      const resetLink = await adminAuth().generatePasswordResetLink(email, {
        url: RESET_PASSWORD_URL,
        handleCodeInApp: true,
      });
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
