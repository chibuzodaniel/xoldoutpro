import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DAY_MS, membershipState } from "@/lib/communities/constants";
import { getViewer } from "@/lib/communities/server";

// Organizer dashboard (v2, design/v2-prototype): overview counts, members
// with their plan and state, applications, and — for the owner — revenue
// from paid memberships (their wallet ledger). Admins only. Loaded on open.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const viewer = await getViewer(id, user.id);
    if (!viewer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!viewer.isAdmin) return NextResponse.json({ error: "Admins only" }, { status: 403 });

    const since30 = new Date(Date.now() - 30 * DAY_MS);
    const [members, requests, plans, ledger, ledger30] = await Promise.all([
      db.membership.findMany({
        where: { groupId: id },
        orderBy: [{ role: "asc" }, { joinedAt: "desc" }],
        take: 1000,
        select: {
          userId: true,
          role: true,
          planId: true,
          expiresAt: true,
          suspendedAt: true,
          autoRenew: true,
          joinedAt: true,
          user: { select: { handle: true, displayName: true, avatarUrl: true } },
        },
      }),
      db.joinRequest.findMany({
        where: { groupId: id, status: { in: ["PENDING", "APPROVED"] } },
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, planId: true, createdAt: true, user: { select: { id: true, handle: true, displayName: true, avatarUrl: true } } },
      }),
      db.membershipPlan.findMany({ where: { groupId: id }, select: { id: true, name: true, priceKobo: true, cycle: true, archivedAt: true } }),
      viewer.isOwner
        ? db.walletLedgerEntry.groupBy({ by: ["kind"], where: { userId: user.id, membershipGroupId: id }, _sum: { amountKobo: true } })
        : Promise.resolve([]),
      viewer.isOwner
        ? db.walletLedgerEntry.groupBy({ by: ["kind"], where: { userId: user.id, membershipGroupId: id, createdAt: { gte: since30 } }, _sum: { amountKobo: true } })
        : Promise.resolve([]),
    ]);

    const now = Date.now();
    const planName = new Map(plans.map((p) => [p.id, p.name]));
    const rows = members.map((m) => ({
      userId: m.userId,
      role: m.userId === viewer.group.creatorId ? "OWNER" : m.role,
      plan: m.planId ? (planName.get(m.planId) ?? null) : null,
      planId: m.planId,
      state: m.userId === viewer.group.creatorId ? "active" : membershipState(m, now),
      expiresAt: m.expiresAt,
      autoRenew: m.autoRenew,
      joinedAt: m.joinedAt,
      user: m.user,
    }));
    const sum = (list: { kind: string; _sum: { amountKobo: number | null } }[], kind: string) =>
      list.find((l) => l.kind === kind)?._sum.amountKobo ?? 0;
    const revenue = viewer.isOwner
      ? {
          grossKobo: sum(ledger, "MEMBERSHIP_CREDIT"),
          commissionKobo: -sum(ledger, "MEMBERSHIP_COMMISSION_FEE"),
          netKobo: sum(ledger, "MEMBERSHIP_CREDIT") + sum(ledger, "MEMBERSHIP_COMMISSION_FEE"),
          last30GrossKobo: sum(ledger30, "MEMBERSHIP_CREDIT"),
        }
      : null;

    return NextResponse.json({
      isOwner: viewer.isOwner,
      overview: {
        total: rows.length,
        active: rows.filter((r) => r.state === "active").length,
        expired: rows.filter((r) => r.state === "expired").length,
        suspended: rows.filter((r) => r.state === "suspended").length,
        pending: requests.filter((r) => r.status === "PENDING").length,
        awaitingPayment: requests.filter((r) => r.status === "APPROVED").length,
        expiringSoon: rows.filter((r) => r.state === "active" && r.expiresAt && new Date(r.expiresAt).getTime() - now < 7 * DAY_MS).length,
        byPlan: plans
          .filter((p) => !p.archivedAt)
          .map((p) => ({ id: p.id, name: p.name, active: rows.filter((r) => r.planId === p.id && r.state === "active").length })),
      },
      revenue,
      members: rows,
      applications: requests.map((r) => ({ ...r, plan: r.planId ? (planName.get(r.planId) ?? null) : null })),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
