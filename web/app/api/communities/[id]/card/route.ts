import { randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { membershipState } from "@/lib/communities/constants";

// The signed-in member's membership card (v2, design/v2-prototype). The QR
// holds cardCode only — whoever scans it is shown what the server says about
// that membership right now, so a screenshot can't outlive the membership.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(name: string) {
  const prefix = (name.replace(/[^A-Za-z]/g, "").slice(0, 3) || "XOL").toUpperCase();
  let rest = "";
  for (let i = 0; i < 7; i++) rest += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${rest}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const membership = await db.membership.findUnique({
      where: { groupId_userId: { groupId: id, userId: user.id } },
      include: { group: { select: { name: true, coverImageUrl: true, creatorId: true } } },
    });
    if (!membership) return NextResponse.json({ error: "You're not a member" }, { status: 404 });

    let cardCode = membership.cardCode;
    for (let attempt = 0; !cardCode && attempt < 5; attempt++) {
      const code = makeCode(membership.group.name);
      const set = await db.membership
        .updateMany({ where: { groupId: id, userId: user.id, cardCode: null }, data: { cardCode: code } })
        .catch(() => ({ count: 0 })); // unique clash: try another code
      if (set.count > 0) cardCode = code;
      else cardCode = (await db.membership.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } }, select: { cardCode: true } }))?.cardCode ?? null;
    }
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
