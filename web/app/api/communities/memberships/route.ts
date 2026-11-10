import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// "My memberships" (v2, design/v2-prototype): every community the fan is in
// (active or lapsed) plus pending / approved-to-pay applications. Two queries.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const groupSelect = { select: { id: true, name: true, coverImageUrl: true, creatorId: true } } as const;
    const [memberships, requests] = await Promise.all([
      db.membership.findMany({
        where: { userId: user.id },
        orderBy: { joinedAt: "desc" },
        take: 200,
        select: { groupId: true, role: true, planId: true, expiresAt: true, suspendedAt: true, autoRenew: true, joinedAt: true, group: groupSelect },
      }),
      db.joinRequest.findMany({
        where: { userId: user.id, status: { in: ["PENDING", "APPROVED"] } },
        select: { groupId: true, status: true, planId: true, group: groupSelect },
      }),
    ]);
    const planIds = [...new Set([...memberships, ...requests].map((m) => m.planId).filter((x): x is string => Boolean(x)))];
    const plans = planIds.length
      ? await db.membershipPlan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true, priceKobo: true, cycle: true } })
      : [];
    const planById = new Map(plans.map((p) => [p.id, p]));
    const memberGroups = new Set(memberships.map((m) => m.groupId));

    return NextResponse.json({
      memberships: memberships.map((m) => ({
        groupId: m.groupId,
        name: m.group.name,
        logoUrl: m.group.coverImageUrl,
        role: m.group.creatorId === user.id ? "OWNER" : m.role,
        plan: m.planId ? (planById.get(m.planId) ?? null) : null,
        expiresAt: m.expiresAt,
        suspendedAt: m.suspendedAt,
        autoRenew: m.autoRenew,
        joinedAt: m.joinedAt,
      })),
      applications: requests
        .filter((r) => !memberGroups.has(r.groupId) || r.status === "APPROVED")
        .map((r) => ({
          groupId: r.groupId,
          name: r.group.name,
          logoUrl: r.group.coverImageUrl,
          status: r.status,
          plan: r.planId ? (planById.get(r.planId) ?? null) : null,
        })),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
