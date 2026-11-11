import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Turn a discount on/off, change its limits, or delete it. A discount that has
// been used is never deleted (orders point at it) — it's switched off instead.
const patchSchema = z.object({
  active: z.boolean().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

async function load(id: string, discountId: string, userId: string) {
  const d = await db.eventDiscount.findUnique({ where: { id: discountId }, include: { event: { select: { creatorId: true } } } });
  return d && d.eventId === id && d.event.creatorId === userId ? d : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; discountId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, discountId } = await params;
    if (!(await load(id, discountId, user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = patchSchema.parse(await req.json());
    const discount = await db.eventDiscount.update({
      where: { id: discountId },
      data: {
        active: body.active,
        ...(body.maxUses !== undefined ? { maxUses: body.maxUses } : {}),
        ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null } : {}),
      },
    });
    return NextResponse.json({ discount });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid change" }, { status: 400 });
    throw err;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; discountId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, discountId } = await params;
    if (!(await load(id, discountId, user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const used = await db.order.count({ where: { discountId } });
    if (used > 0) {
      await db.eventDiscount.update({ where: { id: discountId }, data: { active: false } });
      return NextResponse.json({ ok: true, deactivated: true });
    }
    await db.eventDiscount.delete({ where: { id: discountId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
