import { Prisma, type User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { adminAuth } from "@/lib/firebase/admin";
import { generateUniqueHandle } from "@/lib/handle";
import { buildOwnDomainPasswordResetLink } from "@/lib/auth/passwordReset";
import { sendGuestAccountEmail } from "@/lib/email";

// The core move that makes guest checkout an extension of the existing
// architecture rather than a parallel system (explicit ask, PRD-style doc:
// "reuse existing models... do not duplicate functionality"): a "guest" is
// just a real, passwordless User row, created silently at checkout time.
// Order/Entitlement/Payment/wallet/notification/email all already work in
// terms of a real userId — none of that code needs to know a purchase came
// from someone who never signed up. The buyer is handed a Firebase custom
// token (see the orders route) and signed into the browser they checked out
// on, so "guest access" is just a normal authenticated session against this
// same row, not a bespoke token/access-page system.

/**
 * Resolves the buyer for a checkout that arrived with no Firebase session.
 * An existing account for this email (real or a previous guest checkout) is
 * reused as-is — email is the one thing this app already treats as a unique,
 * durable identity. Only a genuinely new email creates a new (passwordless)
 * account.
 */
export async function resolveGuestBuyer(args: { name: string; email: string }): Promise<{ user: User; isNewAccount: boolean }> {
  const existing = await db.user.findUnique({ where: { email: args.email } });
  if (existing) return { user: existing, isNewAccount: false };

  // A Firebase account can exist for this email with no matching Postgres
  // row — someone started signing up elsewhere and the usual /api/auth/sync
  // call never ran (abandoned onboarding, a previous bug, etc.). Reuse that
  // Firebase account rather than failing outright; this finishes the sync
  // that was always supposed to happen, instead of the checkout blowing up
  // on a customer whose only "mistake" was having started a signup once.
  const firebaseUser = await adminAuth()
    .createUser({ email: args.email, emailVerified: false, displayName: args.name })
    .catch(async (err) => {
      if (err && typeof err === "object" && "code" in err && err.code === "auth/email-already-exists") {
        return adminAuth().getUserByEmail(args.email);
      }
      throw err;
    });

  const handle = await generateUniqueHandle(args.email.split("@")[0]);
  try {
    const user = await db.user.create({
      data: {
        firebaseUid: firebaseUser.uid,
        email: args.email,
        handle,
        displayName: args.name || handle,
      },
    });
    return { user, isNewAccount: true };
  } catch (err) {
    // Two concurrent checkouts for the same brand-new email (a double
    // submit, a network retry) can both pass the findUnique check above
    // before either commits — Postgres's own unique constraints are what
    // actually decide the race. The loser here isn't a real failure: the
    // winner's row already exists and is exactly what this call should
    // return, so treat it as one and re-fetch rather than erroring the
    // buyer's checkout over a timing accident.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await db.user.findUnique({ where: { email: args.email } });
      if (winner) return { user: winner, isNewAccount: false };
    }
    throw err;
  }
}

/**
 * Fire-and-forget — sent once, immediately after a brand-new guest account
 * is created (not gated on the order actually settling, since this is an
 * account/identity email, not a receipt; the separate order-confirmation
 * email still only fires once payment is verified). A failure here must
 * never surface to the buyer or block checkout, same as every other
 * fire-and-forget email in this app.
 */
export async function sendGuestAccountSetupEmail(user: User) {
  try {
    const firebaseLink = await adminAuth().generatePasswordResetLink(user.email);
    const setPasswordUrl = buildOwnDomainPasswordResetLink(firebaseLink);
    await sendGuestAccountEmail({ to: user.email, buyerName: user.displayName, setPasswordUrl });
  } catch (err) {
    console.error("guest account setup email failed", err);
  }
}
