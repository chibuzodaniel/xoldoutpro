import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { MAX_PLANS, MIN_PAID_PLAN_KOBO } from "@/lib/communities/constants";

// Membership plans editor (owner only). The list sent replaces the live
// plans: existing ids are updated, new ones created, and any left out are
// archived — never deleted, since members may be on them (they keep their
// time; an archived plan just isn't offered or renewed).
const planSchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200).optional().nullable(),
  priceKobo: z
    .number()
    .int()
    .min(0)
    .max(100_000_000)
    .refine((k) => k === 0 || k >= MIN_PAID_PLAN_KOBO, "Paid plans need at least ₦100."),
  cycle: z.enum(["MONTHLY", "YEARLY", "ONE_TIME"]),
  benefits: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  capacity: z.number().int().min(1).max(1_000_000).nullable().optional(),
  requiresApproval: z.boolean().default(false),
});
const bodySchema = z.object({ plans: z.array(planSchema).max(MAX_PLANS) });

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { plans } = bodySchema.parse(await req.json());
    const group = await db.fanbaseGroup.findUnique({ where: { id }, select: { creatorId: true } });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (group.creatorId !== user.id) return NextResponse.json({ error: "Only the owner can change plans" }, { status: 403 });

    const live = await db.membershipPlan.findMany({ where: { groupId: id, archivedAt: null }, select: { id: true } });
    const liveIds = new Set(live.map((p) => p.id));
    const keptIds = new Set(plans.map((p) => p.id).filter((x): x is string => Boolean(x && liveIds.has(x))));

    await db.$transaction([
      db.membershipPlan.updateMany({ where: { groupId: id, archivedAt: null, id: { notIn: [...keptIds] } }, data: { archivedAt: new Date() } }),
      ...plans.map((p, order) => {
        const data = {
          name: p.name,
          description: p.description || null,
          priceKobo: p.priceKobo,
          cycle: p.cycle,
          benefits: p.benefits,
          capacity: p.capacity ?? null,
          requiresApproval: p.requiresApproval,
          order,
        };
        return p.id && keptIds.has(p.id)
          ? db.membershipPlan.update({ where: { id: p.id }, data })
          : db.membershipPlan.create({ data: { ...data, groupId: id } });
      }),
    ]);
    const saved = await db.membershipPlan.findMany({ where: { groupId: id, archivedAt: null }, orderBy: { order: "asc" } });
    return NextResponse.json({ plans: saved });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid plans" }, { status: 400 });
    throw err;
  }
}
