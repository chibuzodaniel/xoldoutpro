import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Event discounts (2026-11-11): the host's list and creating one.
const discountInputSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    code: z.string().trim().max(30).regex(/^[A-Za-z0-9_-]*$/, "Codes can use letters, numbers, - and _").nullable().optional(),
    kind: z.enum(["PERCENT", "FLAT"]),
    value: z.number().int().positive(),
    isEarlyBird: z.boolean().default(false),
    startsAt: z.string().datetime().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    maxUses: z.number().int().positive().nullable().optional(),
    tierIds: z.array(z.string().min(1)).max(10).default([]),
    active: z.boolean().default(true),
  })
  .refine((d) => d.kind !== "PERCENT" || d.value <= 100, { message: "A percentage discount can't be over 100%" })
  .refine((d) => !d.startsAt || !d.expiresAt || new Date(d.startsAt) < new Date(d.expiresAt), { message: "The end date must be after the start" });

async function ownedEvent(id: string, userId: string) {
  const event = await db.event.findUnique({ where: { id }, select: { creatorId: true, tiers: { select: { productId: true } } } });
  return event && event.creatorId === userId ? event : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    if (!(await ownedEvent(id, user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const discounts = await db.eventDiscount.findMany({ where: { eventId: id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ discounts });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const event = await ownedEvent(id, user.id);
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const d = discountInputSchema.parse(await req.json());
    const tiers = new Set(event.tiers.map((t) => t.productId));
    if (d.tierIds.some((t) => !tiers.has(t))) return NextResponse.json({ error: "Unknown ticket type" }, { status: 400 });
    const code = d.code?.trim() ? d.code.trim().toUpperCase() : null;
    if (code && (await db.eventDiscount.findUnique({ where: { eventId_code: { eventId: id, code } } }))) {
      return NextResponse.json({ error: "You already have a discount with that code" }, { status: 400 });
    }
    const discount = await db.eventDiscount.create({
      data: {
        eventId: id,
        name: d.name,
        code,
        kind: d.kind,
        value: d.value,
        isEarlyBird: d.isEarlyBird,
        startsAt: d.startsAt ? new Date(d.startsAt) : null,
        expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
        maxUses: d.maxUses ?? null,
        tierIds: d.tierIds,
        active: d.active,
      },
    });
    return NextResponse.json({ discount }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid discount" }, { status: 400 });
    throw err;
  }
}
