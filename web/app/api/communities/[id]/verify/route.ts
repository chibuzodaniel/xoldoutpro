import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { membershipState } from "@/lib/communities/constants";
import { getViewer } from "@/lib/communities/server";

// Scan / verify a membership card (admins of this community). Always answers
// from the database: ACTIVE, or EXPIRED / SUSPENDED / not a member here.
const bodySchema = z.object({ code: z.string().trim().min(3).max(200) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const viewer = await getViewer(id, user.id);
    if (!viewer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!viewer.isAdmin) return NextResponse.json({ error: "Only admins can verify cards" }, { status: 403 });

    // The QR holds the code; accept a pasted link that ends with it too.
    const raw = bodySchema.parse(await req.json()).code;
    const code = raw.split(/[/?=#]/).filter(Boolean).pop()!.toUpperCase();
    const m = await db.membership.findUnique({
      where: { cardCode: code },
      include: { user: { select: { displayName: true, handle: true, avatarUrl: true } } },
    });
    if (!m || m.groupId !== id) return NextResponse.json({ valid: false, reason: "Not a member of this community" });

    const plan = m.planId ? await db.membershipPlan.findUnique({ where: { id: m.planId }, select: { name: true } }) : null;
    const state = m.userId === viewer.group.creatorId ? "active" : membershipState(m);
    return NextResponse.json({
      valid: state === "active",
      state,
      member: m.user,
      plan: plan?.name ?? (m.role === "ADMIN" ? "Admin" : "Member"),
      expiresAt: m.expiresAt,
      cardCode: code,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Enter a card code" }, { status: 400 });
    throw err;
  }
}
