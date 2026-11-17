import { adminAuth } from "@/lib/firebase/admin";
import { sendGuestCode, verifyGuestCode, GuestVerificationError } from "@/lib/commerce/guestVerification";

// Email + password sign-up with a 6-digit email code (explicit ask,
// 2026-11-17: "every email should be verified using a code", extended from
// the guest membership checkout to normal sign-up). Same code store and
// limits as guest checkout (lib/commerce/guestVerification.ts). The Firebase
// account is only created here on the server, after the code checks out, and
// is marked emailVerified. Google sign-up is unchanged: Google has already
// verified those addresses.

export { GuestVerificationError as SignupError };

function passwordProblem(p: string) {
  if (p.length < 8 || p.length > 128 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) return "Use 8 to 128 characters, with a letter and a number.";
  return null;
}

async function emailHasAccount(email: string) {
  return adminAuth()
    .getUserByEmail(email)
    .then(() => true)
    .catch((err: { code?: string }) => {
      if (err?.code === "auth/user-not-found") return false;
      throw err;
    });
}

/** Step 1: email the code (after the cheap checks, so a taken email doesn't cost a code). */
export async function sendSignupCode(args: { name: string; email: string; ip: string | null }) {
  if (await emailHasAccount(args.email)) throw new GuestVerificationError("email_taken", 409);
  await sendGuestCode({ ...args, purpose: "signup" });
}

/** Step 2: check the code, create the verified account, hand back a sign-in token. */
export async function createAccountWithCode(args: { name: string; email: string; password: string; code: string }) {
  const bad = passwordProblem(args.password);
  if (bad) throw new GuestVerificationError(bad);
  await verifyGuestCode({ email: args.email, code: args.code });
  const user = await adminAuth()
    .createUser({ email: args.email, password: args.password, displayName: args.name, emailVerified: true })
    .catch((err: { code?: string }) => {
      if (err?.code === "auth/email-already-exists") throw new GuestVerificationError("email_taken", 409);
      throw err;
    });
  return adminAuth().createCustomToken(user.uid);
}
