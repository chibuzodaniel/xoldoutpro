import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Host settings for the events marketplace (2026-11-11): promoter programme
// (open to applications, PERCENT range or FLAT per ticket) and per-buyer
// ticket limits for the event and each ticket type.
const schema = z
  .object({
    promotersOpen: z.boolean().optional(),
    promoterPayType: z.enum(["PERCENT", "FLAT"]).optional(),
    promoterMinPercent: z.number().int().min(1).max(100).optional(),
    promoterMaxPercent: z.number().int().min(1).max(100).optional(),
    promoterFlatKobo: z.number().int().min(0).max(100_000_000).optional(),
    maxPerBuyer: z.number().int().min(1).max(100).nullable().optional(),
    tierLimits: z.array(z.object({ productId: z.string().min(1), maxPerBuyer: z.number().int().min(1).max(100).nullable() })).max(10).optional(),
  })
  .refine((b) => b.promoterMinPercent === undefined || b.promoterMaxPercent === undefined || b.promoterMinPercent <= b.promoterMaxPercent, {
    message: "The lowest % can't be above the highest",
  });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const body = schema.parse(await req.json());
    const event = await db.event.findUnique({ where: { id }, select: { creatorId: true, status: true, tiers: { select: { productId: true } } } });
    if (!event || event.creatorId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (event.status === "DELETED") return NextResponse.json({ error: "Event is deleted" }, { status: 409 });
    const tierIds = new Set(event.tiers.map((t) => t.productId));
    if (body.tierLimits?.some((t) => !tierIds.has(t.productId))) return NextResponse.json({ error: "Unknown ticket type" }, { status: 400 });

    await db.$transaction([
      db.event.update({
        where: { id },
        data: {
          promotersOpen: body.promotersOpen,
          promoterPayType: body.promoterPayType,
          promoterMinPercent: body.promoterMinPercent,
          promoterMaxPercent: body.promoterMaxPercent,
          promoterFlatKobo: body.promoterFlatKobo,
          ...(body.maxPerBuyer !== undefined ? { maxPerBuyer: body.maxPerBuyer } : {}),
        },
      }),
      ...(body.tierLimits ?? []).map((t) => db.ticketTier.update({ where: { productId: t.productId }, data: { maxPerBuyer: t.maxPerBuyer } })),
    ]);
    revalidatePath(`/e/${id}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid settings" }, { status: 400 });
    throw err;
  }
}
