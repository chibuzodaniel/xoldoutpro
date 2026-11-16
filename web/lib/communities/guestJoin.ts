import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { adminAuth } from "@/lib/firebase/admin";
import { generateUniqueHandle } from "@/lib/handle";
import { resolveGuestBuyer } from "@/lib/commerce/guestCheckout";
import { isGuestEmailVerified } from "@/lib/commerce/guestVerification";
import { startProcessorCheckout, type Gateway } from "@/lib/commerce/processorCheckout";
import { sendGuestMembershipEmail } from "@/lib/email";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";
import { isMembershipActive, membershipState } from "@/lib/communities/constants";
import { getJoinablePlan, MembershipUnavailableError } from "@/lib/communities/payments";
import { ensureCardCode } from "@/lib/communities/card";

// Guest membership checkout (explicit ask, 2026-11-16): JOIN COMMUNITY → plans
// → guest checkout (name, email, optional phone) → pay → card → create account
// → linked. No account before payment.
//
// It reuses the guest-buyer model from product checkout
// (lib/commerce/guestCheckout.ts): the buyer is a hidden *pending* User row
// for a new email, or the existing account for a known one. So the paid
// membership is an ordinary Membership from the start (card, QR, Active /
// Expired, expiry, renewals, the organizer's scanner all work unchanged), and
// creating the account later just turns that pending row into a real login.
// GuestMembershipClaim holds the secure claim link (token) and marks the one
// claim. Signing up the normal way with the same email also links it
// (app/api/auth/sync adopts the pending row). Every guest email is confirmed
// with a 6-digit code before checkout (lib/commerce/guestVerification.ts).

const SITE_URL = "https://www.xoldout.app";

export class GuestJoinError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function claimUrl(groupId: string, token: string) {
  return `${SITE_URL}/join/${groupId}/welcome?token=${token}`;
}

/** Start a guest membership: free plans join now; paid plans go to the processor. */
export async function startGuestMembership(args: {
  groupId: string;
  planId: string;
  name: string;
  email: string;
  phone: string | null;
  /** Proof the buyer typed the code emailed to them (explicit ask: every email verified with a code). */
  verificationToken: string;
  gateway: Gateway;
  origin: string;
}): Promise<{ status: "JOINED"; token: string } | { status: "CHECKOUT"; token: string; checkoutUrl: string; ref: string }> {
  const email = args.email.trim().toLowerCase();
  const name = args.name.trim();
  if (!(await isGuestEmailVerified(email, args.verificationToken))) {
    throw new GuestJoinError("Confirm your email with the code we sent before paying.", 403);
  }
  const { user } = await resolveGuestBuyer({ name, email });
  if (user.deletedAt) throw new GuestJoinError("This email belongs to a deleted XOLDOUT account. Sign in to recover it first.", 409);

  let plan;
  try {
    plan = await getJoinablePlan(args.groupId, args.planId, user.id);
  } catch (err) {
    if (err instanceof MembershipUnavailableError) throw new GuestJoinError(err.message, 409);
    throw err;
  }
  if (!plan) throw new GuestJoinError("That plan isn't available any more", 404);
  if (plan.requiresApproval) throw new GuestJoinError("This plan needs an admin's approval first. Create an account to apply.", 409);

  const existing = await db.membership.findUnique({ where: { groupId_userId: { groupId: args.groupId, userId: user.id } } });
  if (existing?.suspendedAt) throw new GuestJoinError("This email can't join this community.", 403);
  if (existing && existing.planId === plan.id && isMembershipActive(existing) && (plan.priceKobo === 0 || plan.cycle === "ONE_TIME")) {
    throw new GuestJoinError("This email is already a member on this plan. Sign in to see your card.", 409);
  }

  const token = randomBytes(24).toString("base64url");
  const claim = { token, userId: user.id, groupId: args.groupId, planId: plan.id, name, email, phone: args.phone };

  if (plan.priceKobo === 0) {
    await db.membership.upsert({
      where: { groupId_userId: { groupId: args.groupId, userId: user.id } },
      create: { groupId: args.groupId, userId: user.id, role: "MEMBER", planId: plan.id },
      update: { planId: plan.id, expiresAt: null, renewalNotifiedAt: null },
    });
    await db.guestMembershipClaim.create({ data: claim });
    await ensureCardCode(args.groupId, user.id, plan.group.name);
    notifyUsersAfterResponse([plan.group.creatorId], {
      kind: "FANBASE",
      title: "New member",
      body: `${name} joined ${plan.group.name} (${plan.name})`,
      url: `/groups/${args.groupId}`,
      tag: `community-join-${args.groupId}`,
    });
    void sendClaimEmail(token);
    return { status: "JOINED", token };
  }

  const ref = `gmem-${user.id}-${plan.id}-${Date.now()}`;
  await db.payment.create({
    data: {
      membershipUserId: user.id,
      membershipGroupId: args.groupId,
      membershipPlanId: plan.id,
      // Auto-renew needs a signed-in account; guests renew by hand (or switch it on after claiming).
      membershipAutoRenew: false,
      processor: args.gateway,
      processorRef: ref,
      amountKobo: plan.priceKobo,
      status: "INITIATED",
    },
  });
  await db.guestMembershipClaim.create({ data: { ...claim, paymentRef: ref } });
  const checkoutUrl = await startProcessorCheckout({
    gateway: args.gateway,
    txRef: ref,
    amountKobo: plan.priceKobo,
    customerEmail: email,
    customerName: name,
    redirectUrl: `${args.origin}/join/${args.groupId}/welcome`,
    title: `XOLDOUT — ${plan.group.name} · ${plan.name}`,
  });
  return { status: "CHECKOUT", token, checkoutUrl, ref };
}

/**
 * After a membership payment succeeds (lib/communities/payments.ts): if it was a
 * guest checkout, make the card now and email the claim link. Safe to repeat.
 */
export async function afterGuestMembershipPaid(paymentRef: string) {
  const claim = await db.guestMembershipClaim.findUnique({ where: { paymentRef } });
  if (!claim) return;
  const group = await db.fanbaseGroup.findUnique({ where: { id: claim.groupId }, select: { name: true } });
  await ensureCardCode(claim.groupId, claim.userId, group?.name ?? "XOL");
  await sendClaimEmail(claim.token);
}

/** Sends the confirmation + claim link once per claim. */
async function sendClaimEmail(token: string) {
  try {
    const first = await db.guestMembershipClaim.updateMany({ where: { token, emailedAt: null }, data: { emailedAt: new Date() } });
    if (first.count === 0) return;
    const claim = await db.guestMembershipClaim.findUniqueOrThrow({ where: { token } });
    const [group, plan, membership, user] = await Promise.all([
      db.fanbaseGroup.findUnique({ where: { id: claim.groupId }, select: { name: true } }),
      db.membershipPlan.findUnique({ where: { id: claim.planId }, select: { name: true } }),
      db.membership.findUnique({ where: { groupId_userId: { groupId: claim.groupId, userId: claim.userId } }, select: { cardCode: true, expiresAt: true } }),
      db.user.findUnique({ where: { id: claim.userId }, select: { pendingGuestAt: true } }),
    ]);
    await sendGuestMembershipEmail({
      to: claim.email,
      buyerName: claim.name,
      communityName: group?.name ?? "the community",
      planName: plan?.name ?? "Member",
      membershipId: membership?.cardCode ?? "On your card",
      expiresAt: membership?.expiresAt ?? null,
      claimUrl: claimUrl(claim.groupId, token),
      hasAccount: !user?.pendingGuestAt,
    });
  } catch (err) {
    console.error("guest membership email failed", err);
  }
}

export type GuestMembershipView = {
  status: "PENDING" | "PAID" | "FAILED";
  community: { id: string; name: string; logoUrl: string | null };
  email: string;
  /** needs_account: create one now. has_account: the email already had one; sign in. claimed: done. */
  account: "needs_account" | "has_account" | "claimed";
  card: {
    cardCode: string;
    community: { id: string; name: string; logoUrl: string | null };
    member: { displayName: string; avatarUrl: string | null };
    plan: string;
    recurring: boolean;
    state: "active" | "expired" | "suspended";
    expiresAt: string | null;
    autoRenew: boolean;
    issuedAt: string;
  } | null;
};

/** What the welcome page shows for a claim link. Null if the token is unknown. */
export async function getGuestMembershipView(token: string): Promise<GuestMembershipView | null> {
  const claim = await db.guestMembershipClaim.findUnique({ where: { token } });
  if (!claim) return null;
  const [group, plan, payment, user] = await Promise.all([
    db.fanbaseGroup.findUnique({ where: { id: claim.groupId }, select: { id: true, name: true, coverImageUrl: true } }),
    db.membershipPlan.findUnique({ where: { id: claim.planId }, select: { name: true, priceKobo: true, cycle: true } }),
    claim.paymentRef ? db.payment.findUnique({ where: { processorRef: claim.paymentRef }, select: { status: true } }) : null,
    db.user.findUnique({ where: { id: claim.userId }, select: { pendingGuestAt: true, avatarUrl: true } }),
  ]);
  if (!group) return null;
  const status = !claim.paymentRef ? "PAID" : payment?.status === "SUCCESSFUL" ? "PAID" : payment?.status === "FAILED" ? "FAILED" : "PENDING";
  const community = { id: group.id, name: group.name, logoUrl: group.coverImageUrl };

  let card: GuestMembershipView["card"] = null;
  if (status === "PAID") {
    const membership = await db.membership.findUnique({ where: { groupId_userId: { groupId: claim.groupId, userId: claim.userId } } });
    const cardCode = membership ? (membership.cardCode ?? (await ensureCardCode(claim.groupId, claim.userId, group.name))) : null;
    if (membership && cardCode) {
      card = {
        cardCode,
        community,
        member: { displayName: claim.name, avatarUrl: user?.avatarUrl ?? null },
        plan: plan?.name ?? "Member",
        recurring: Boolean(plan && plan.priceKobo > 0 && plan.cycle !== "ONE_TIME"),
        state: membershipState(membership),
        expiresAt: membership.expiresAt?.toISOString() ?? null,
        autoRenew: membership.autoRenew,
        issuedAt: membership.joinedAt.toISOString(),
      };
    }
  }
  const account = claim.claimedAt ? "claimed" : user?.pendingGuestAt ? "needs_account" : "has_account";
  return { status, community, email: claim.email, account, card };
}

/**
 * Create the buyer's account after payment and link the membership (it's
 * already on their row). One claim only: the pending row is flipped with a
 * guarded update, so a second attempt (or a race) gets "already claimed".
 * Returns a Firebase custom token so the page can sign them straight in.
 */
export async function claimGuestMembership(token: string, password: string): Promise<{ customToken: string; groupId: string }> {
  const claim = await db.guestMembershipClaim.findUnique({ where: { token } });
  if (!claim) throw new GuestJoinError("This link isn't valid any more.", 404);
  const view = await getGuestMembershipView(token);
  if (!view || view.status !== "PAID") throw new GuestJoinError("Your payment hasn't been confirmed yet. Try again in a moment.", 409);

  const user = await db.user.findUnique({ where: { id: claim.userId } });
  if (!user) throw new GuestJoinError("This link isn't valid any more.", 404);
  if (!user.pendingGuestAt) throw new GuestJoinError("This membership is already linked to an account. Sign in with this email.", 409);

  const firebaseUser = await adminAuth()
    .createUser({ email: user.email, password, displayName: claim.name, emailVerified: true })
    .catch((err: unknown) => {
      if (err && typeof err === "object" && "code" in err && err.code === "auth/email-already-exists") {
        throw new GuestJoinError("This email already has a XOLDOUT login. Sign in with it and your membership will be there.", 409);
      }
      if (err && typeof err === "object" && "code" in err && err.code === "auth/invalid-password") {
        throw new GuestJoinError("Choose a stronger password (at least 8 characters, with a letter and a number).", 400);
      }
      throw err;
    });

  const handle = await generateUniqueHandle(user.email.split("@")[0]);
  const flipped = await db.user.updateMany({
    where: { id: user.id, pendingGuestAt: { not: null } },
    data: { firebaseUid: firebaseUser.uid, handle, pendingGuestAt: null, displayName: claim.name || user.displayName },
  });
  if (flipped.count === 0) {
    // Someone else claimed it in the meantime: undo the extra login.
    await adminAuth().deleteUser(firebaseUser.uid).catch(() => {});
    throw new GuestJoinError("This membership is already linked to an account. Sign in with this email.", 409);
  }
  await markClaimed(user.id);
  return { customToken: await adminAuth().createCustomToken(firebaseUser.uid), groupId: claim.groupId };
}

/** Every guest membership for this buyer row counts as claimed (also called when they sign up the normal way). */
export async function markClaimed(userId: string) {
  await db.guestMembershipClaim.updateMany({ where: { userId, claimedAt: null }, data: { claimedAt: new Date() } });
}
