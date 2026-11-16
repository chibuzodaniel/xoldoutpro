import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { membershipState } from "@/lib/communities/constants";
import { ensureCardCode } from "@/lib/communities/card";

// The signed-in member's membership card (v2, design/v2-prototype). The QR
// holds cardCode only — whoever scans it is shown what the server says about
// that membership right now, so a screenshot can't outlive the membership.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const membership = await db.membership.findUnique({
      where: { groupId_userId: { groupId: id, userId: user.id } },
      include: { group: { select: { name: true, coverImageUrl: true, creatorId: true } } },
    });
    if (!membership) return NextResponse.json({ error: "You're not a member" }, { status: 404 });

    const cardCode = membership.cardCode ?? (await ensureCardCode(id, user.id, membership.group.name));
    if (!cardCode) return NextResponse.json({ error: "Couldn't make your card. Try again." }, { status: 500 });

    const plan = membership.planId ? await db.membershipPlan.findUnique({ where: { id: membership.planId }, select: { name: true, priceKobo: true, cycle: true } }) : null;
    const isOwner = membership.group.creatorId === user.id;
    return NextResponse.json({
      card: {
        cardCode,
        community: { id, name: membership.group.name, logoUrl: membership.group.coverImageUrl },
        member: { displayName: user.displayName, avatarUrl: user.avatarUrl },
        plan: plan?.name ?? (isOwner ? "Owner" : membership.role === "ADMIN" ? "Admin" : "Member"),
        recurring: Boolean(plan && plan.priceKobo > 0 && plan.cycle !== "ONE_TIME"),
        state: isOwner ? "active" : membershipState(membership),
        expiresAt: membership.expiresAt,
        autoRenew: membership.autoRenew,
        issuedAt: membership.joinedAt,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
