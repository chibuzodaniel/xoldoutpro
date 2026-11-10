import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";

const bodySchema = z.object({ action: z.enum(["approve", "reject"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, requestId } = await params;
    const { action } = bodySchema.parse(await req.json());

    // Admins, plus the owner unconditionally — same set that sees the
    // request in GET /api/groups/join-requests.
    const [membership, owned] = await Promise.all([
      db.membership.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } }),
      db.fanbaseGroup.count({ where: { id, creatorId: user.id } }),
    ]);
    if (membership?.role !== "ADMIN" && owned === 0) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

    const request = await db.joinRequest.findUnique({ where: { id: requestId } });
    if (!request || request.groupId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (request.status !== "PENDING") return NextResponse.json({ error: "Already resolved" }, { status: 409 });

    // updateMany with a status: "PENDING" filter (rather than the earlier
    // findUnique-then-update) makes the transition atomic: two concurrent
    // approve/reject calls can't both pass the "already resolved" guard and
    // both act — only one's updateMany affects a row.
    // Community plan application (v2): approving a paid plan lets the fan
    // pay (the payment makes the membership); a free plan joins them now.
    const plan = action === "approve" && request.planId ? await db.membershipPlan.findUnique({ where: { id: request.planId } }) : null;
    if (plan && plan.priceKobo > 0) {
      const { count } = await db.joinRequest.updateMany({ where: { id: requestId, status: "PENDING" }, data: { status: "APPROVED" } });
      if (count === 0) return NextResponse.json({ error: "Already resolved" }, { status: 409 });
      const g = await db.fanbaseGroup.findUnique({ where: { id }, select: { name: true } });
      notifyUsersAfterResponse([request.userId], {
        kind: "FANBASE",
        title: "Application approved",
        body: `You're approved for ${plan.name} in ${g?.name ?? "the community"}. Pay to join.`,
        url: `/groups/${id}?join=${plan.id}`,
      });
      return NextResponse.json({ ok: true, awaitingPayment: true });
    }

    if (action === "approve") {
      const group = await db.$transaction(async (tx) => {
        const { count } = await tx.joinRequest.updateMany({ where: { id: requestId, status: "PENDING" }, data: { status: "APPROVED" } });
        if (count === 0) return null;
        await tx.membership.upsert({
          where: { groupId_userId: { groupId: id, userId: request.userId } },
          update: plan ? { planId: plan.id, expiresAt: null } : {},
          create: { groupId: id, userId: request.userId, role: "MEMBER", planId: plan?.id ?? null },
        });
        return tx.fanbaseGroup.findUnique({ where: { id }, select: { name: true } });
      });
      if (group === null) return NextResponse.json({ error: "Already resolved" }, { status: 409 });
      notifyUsersAfterResponse([request.userId], {
        kind: "FANBASE",
        title: "Fanbase request approved",
        body: `You're in ${group.name ?? "the Fanbase"}`,
        url: `/groups/${id}`,
      });
    } else {
      const { count } = await db.joinRequest.updateMany({ where: { id: requestId, status: "PENDING" }, data: { status: "REJECTED" } });
      if (count === 0) return NextResponse.json({ error: "Already resolved" }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
