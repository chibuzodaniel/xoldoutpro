import { randomBytes } from "crypto";
import { Prisma, type User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { adminAuth } from "@/lib/firebase/admin";
import { generateUniqueHandle } from "@/lib/handle";
import { buildOwnDomainPasswordResetLink } from "@/lib/auth/passwordReset";
import { sendGuestAccountEmail } from "@/lib/email";

// The core move that makes guest checkout an extension of the existing
// architecture rather than a parallel system (explicit ask, PRD-style doc:
// "reuse existing models... do not duplicate functionality"): a "guest" is
// just a real, passwordless User row. Order/Entitlement/Payment/wallet/
// notification/email all already work in terms of a real userId — none of
// that code needs to know a purchase came from someone who never signed up.
// Since 2026-10-15 the row starts as a hidden *pending* placeholder at
// checkout and only becomes a real account once payment succeeds
// (activatePendingGuest); the checkout return page then gets a Firebase
// custom token and signs the browser in, so "guest access" is just a normal
// authenticated session against this same row.

/**
 * Resolves the buyer for a checkout that arrived with no Firebase session.
 * An existing account for this email (real or a previous guest checkout) is
 * reused as-is — email is the one thing this app already treats as a unique,
 * durable identity. A genuinely new email gets a *pending* placeholder row
 * (explicit ask, 2026-10-15: no account until they've paid) — see
 * User.pendingGuestAt and activatePendingGuest below. isPendingGuest is also
 * true for a placeholder left over from an earlier abandoned checkout.
 */
export async function resolveGuestBuyer(args: { name: string; email: string }): Promise<{ user: User; isPendingGuest: boolean }> {
  const existing = await db.user.findUnique({ where: { email: args.email } });
  if (existing) {
    if (existing.pendingGuestAt && args.name && existing.displayName !== args.name) {
      const renamed = await db.user.update({ where: { id: existing.id }, data: { displayName: args.name } });
      return { user: renamed, isPendingGuest: true };
    }
    return { user: existing, isPendingGuest: Boolean(existing.pendingGuestAt) };
  }

  // Placeholder identity only — no Firebase login exists for it, so nobody
  // can sign into it, and the guest- handle is never shown (pending rows are
  // filtered out of every listing and profile lookup).
  const placeholder = randomBytes(8).toString("hex");
  try {
    const user = await db.user.create({
      data: {
        firebaseUid: `pending-guest:${placeholder}`,
        email: args.email,
        handle: `guest-${placeholder}`,
        displayName: args.name || "Guest",
        pendingGuestAt: new Date(),
      },
    });
    return { user, isPendingGuest: true };
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
      if (winner) return { user: winner, isPendingGuest: Boolean(winner.pendingGuestAt) };
    }
    throw err;
  }
}

/**
 * Turns a pending guest placeholder into a real account once their payment
 * has gone through (finalizePayment, the free-order path, and the checkout
 * return page as a retry): creates the Firebase login, gives them a real
 * handle, and sends the "set a password" email. Safe to call repeatedly or
 * concurrently — only the call that wins the claim below sends the email.
 * Returns the (now real) user, or null if it isn't a pending guest.
 */
export async function activatePendingGuest(userId: string): Promise<User | null> {
  const pending = await db.user.findUnique({ where: { id: userId } });
  if (!pending) return null;
  if (!pending.pendingGuestAt) return pending;

  // A Firebase account can exist for this email with no matching Postgres
  // row — someone started signing up elsewhere and the usual /api/auth/sync
  // call never ran (abandoned onboarding, a previous bug, etc.). Reuse that
  // Firebase account rather than failing outright.
  const firebaseUser = await adminAuth()
    .createUser({ email: pending.email, emailVerified: true, displayName: pending.displayName })
    .catch(async (err) => {
      if (err && typeof err === "object" && "code" in err && err.code === "auth/email-already-exists") {
        return adminAuth().getUserByEmail(pending.email);
      }
      throw err;
    });

  const handle = await generateUniqueHandle(pending.email.split("@")[0]);
  const claimed = await db.user.updateMany({
    where: { id: userId, pendingGuestAt: { not: null } },
    data: { firebaseUid: firebaseUser.uid, handle, pendingGuestAt: null },
  });
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (claimed.count > 0) void sendGuestAccountSetupEmail(user);
  return user;
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
