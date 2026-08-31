import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth } from "@/lib/firebase/admin";
import { sendPasswordResetEmail } from "@/lib/email";

const bodySchema = z.object({ email: z.string().trim().email() });

// Firebase's own docs, checked directly after a real reset link came back
// pointing at Firebase's hosted domain despite `actionCodeSettings` below:
// `handleCodeInApp` never changes which *domain* generatePasswordResetLink
// emits a link on — it only controls whether that Firebase-hosted page
// later redirects into a mobile app via a Universal/App Link. `url` is
// always just a `continueUrl` query param tacked onto the end of Firebase's
// own hosted action page; there is no supported option that makes this
// call itself return a link on a different host. (An earlier version of
// this file assumed otherwise and shipped it unverified — this session's
// network can't reach identitytoolkit.googleapis.com to test against, which
// is exactly why that assumption should have been flagged instead of
// asserted; the user hitting a real "referrer blocked" error against
// Firebase's own domain moments after deploy is what surfaced it.)
//
// The fix Firebase's docs point at for wanting full control over the
// domain — "build your own custom email action handler" — is to extract
// the `oobCode` Firebase already generated (it's a plain query param on the
// link this call returns) and build our own URL around it. The code itself
// isn't tied to whatever host it's displayed on: app/(auth)/reset-password
// hands that same code straight to verifyPasswordResetCode/
// confirmPasswordReset, which talk to Firebase directly regardless of
// where the page serving them is hosted.
const RESET_PASSWORD_URL = "https://www.xoldout.app/reset-password";

function buildOwnDomainResetLink(firebaseLink: string): string {
  const oobCode = new URL(firebaseLink).searchParams.get("oobCode");
  if (!oobCode) throw new Error("generatePasswordResetLink returned no oobCode");
  return `${RESET_PASSWORD_URL}?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`;
}

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
      const firebaseLink = await adminAuth().generatePasswordResetLink(email);
      const resetLink = buildOwnDomainResetLink(firebaseLink);
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
