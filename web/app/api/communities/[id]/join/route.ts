import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";
import { isMembershipActive } from "@/lib/communities/constants";
import { getJoinablePlan, MembershipUnavailableError, startMembershipCheckout } from "@/lib/communities/payments";

// Join a community on a plan (v2, design/v2-prototype):
//  • no plans (a plain Fanbase): the old rules — open joins, private asks.
//  • a plan that needs approval and hasn't been approved: application.
//  • a free plan: joined.
//  • a paid plan: processor checkout; the webhook makes the membership.
// An invite code skips the "private community" request step (not plan approval).
const bodySchema = z.object({
  planId: z.string().min(1).max(64).optional(),
  autoRenew: z.boolean().default(true),
  gateway: z.enum(["flutterwave", "monnify", "bachs"]).default("bachs"),
  inviteCode: z.string().trim().max(20).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const body = bodySchema.parse(await req.json().catch(() => ({})));

    const group = await db.fanbaseGroup.findUnique({
      where: { id },
      select: { id: true, name: true, creatorId: true, visibility: true, inviteCode: true, _count: { select: { plans: { where: { archivedAt: null } } } } },
    });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const existing = await db.membership.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } });
    const invited = Boolean(body.inviteCode && group.inviteCode && body.inviteCode.toUpperCase() === group.inviteCode);

    const notifyAdmins = async (title: string, text: string) => {
      const admins = await db.membership.findMany({ where: { groupId: id, role: "ADMIN" }, select: { userId: true } });
      notifyUsersAfterResponse([group.creatorId, ...admins.map((a) => a.userId)], {
        kind: "FANBASE",
        title,
        body: text,
        url: "/groups/requests",
        icon: user.avatarUrl ?? undefined,
      });
    };

    // ── A community with no plans: the original Fanbase behaviour.
    if (group._count.plans === 0) {
      if (existing) return NextResponse.json({ status: "JOINED" });
      if (group.visibility === "OPEN" || invited) {
        await db.membership.create({ data: { groupId: id, userId: user.id, role: "MEMBER" } });
        return NextResponse.json({ status: "JOINED" });
      }
      const prior = await db.joinRequest.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } });
      await db.joinRequest.upsert({
        where: { groupId_userId: { groupId: id, userId: user.id } },
        update: { status: "PENDING", planId: null },
        create: { groupId: id, userId: user.id },
      });
      if (prior?.status !== "PENDING") await notifyAdmins("New community request", `${user.displayName} wants to join ${group.name}`);
      return NextResponse.json({ status: "PENDING" });
    }

    // ── Plan-based joining.
    if (!body.planId) return NextResponse.json({ error: "Choose a plan" }, { status: 400 });
    const plan = await getJoinablePlan(id, body.planId, user.id);
    if (!plan) return NextResponse.json({ error: "That plan isn't available" }, { status: 404 });

    const onThisPlan = existing?.planId === plan.id && isMembershipActive(existing);
    if (onThisPlan && (plan.priceKobo === 0 || plan.cycle === "ONE_TIME")) return NextResponse.json({ status: "JOINED" });

    if (plan.requiresApproval && !onThisPlan) {
      const request = await db.joinRequest.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } });
      const approvedForThis = request?.status === "APPROVED" && request.planId === plan.id;
      if (!approvedForThis) {
        await db.joinRequest.upsert({
          where: { groupId_userId: { groupId: id, userId: user.id } },
          update: { status: "PENDING", planId: plan.id },
          create: { groupId: id, userId: user.id, planId: plan.id },
        });
        if (!(request?.status === "PENDING" && request.planId === plan.id)) {
          await notifyAdmins("New membership application", `${user.displayName} applied for ${plan.name} in ${group.name}`);
        }
        return NextResponse.json({ status: "PENDING" });
      }
    }

    if (plan.priceKobo === 0) {
      await db.$transaction([
        db.membership.upsert({
          where: { groupId_userId: { groupId: id, userId: user.id } },
          create: { groupId: id, userId: user.id, role: "MEMBER", planId: plan.id },
          update: { planId: plan.id, expiresAt: null, renewalNotifiedAt: null },
        }),
        db.joinRequest.deleteMany({ where: { groupId: id, userId: user.id, status: "APPROVED" } }),
      ]);
      return NextResponse.json({ status: "JOINED" });
    }

    const { checkoutUrl, paymentRef } = await startMembershipCheckout({
      member: { id: user.id, email: user.email, displayName: user.displayName },
      groupId: id,
      planId: plan.id,
      autoRenew: body.autoRenew,
      gateway: body.gateway,
      origin: req.nextUrl.origin,
    });
    return NextResponse.json({ status: "CHECKOUT", checkoutUrl, ref: paymentRef });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof MembershipUnavailableError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not join" }, { status: 500 });
  }
}

const patchSchema = z.object({ autoRenew: z.boolean() });

// The member's auto-renew switch for their paid plan.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { autoRenew } = patchSchema.parse(await req.json());
    const updated = await db.membership.updateMany({
      where: { groupId: id, userId: user.id },
      data: autoRenew ? { autoRenew, renewalNotifiedAt: null } : { autoRenew },
    });
    if (updated.count === 0) return NextResponse.json({ error: "Not a member" }, { status: 404 });
    return NextResponse.json({ ok: true, autoRenew });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    throw err;
  }
}
