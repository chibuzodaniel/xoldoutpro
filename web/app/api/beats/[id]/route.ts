import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listingEditState, EDIT_WINDOW_HOURS } from "@/lib/editWindow";
import { BEAT_GENRES, BEAT_MOODS } from "@/lib/discover/sectionFilters";
import { licenseInputSchema, licensesSchema } from "@/lib/commerce/beatLicenses";
import { revalidatePath } from "next/cache";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  priceKobo: z.number().int().min(0).optional(),
  cap: z.number().int().positive().optional(),
  // Structure (Edit release, explicit ask 2026-11-11): editable any time.
  genre: z.enum(BEAT_GENRES).nullable().optional(),
  mood: z.enum(BEAT_MOODS).nullable().optional(),
  bpm: z.number().int().min(20).max(400).nullable().optional(),
  musicalKey: z.string().trim().max(10).nullable().optional(),
  tags: z.array(z.string().trim().max(24)).max(8).optional(),
  // The full list of license tiers, in order; an `id` keeps an existing tier.
  licenses: z
    .array(licenseInputSchema.and(z.object({ id: z.string().max(64).optional() })))
    .superRefine((ls, ctx) => {
      const r = licensesSchema.safeParse(ls.map((l) => ({ name: l.name, priceKobo: l.priceKobo, formats: l.formats, isExclusive: l.isExclusive, terms: l.terms })));
      if (!r.success) ctx.addIssue({ code: "custom", message: r.error.issues[0]?.message ?? "Invalid licenses" });
    })
    .optional(),
});

async function loadOwned(id: string, userId: string) {
  const product = await db.product.findUnique({ where: { id }, include: { stockPolicy: true, beat: true } });
  if (!product || product.creatorId !== userId || !product.beat) return null;
  return product;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const product = await loadOwned(id, user.id);
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (product.status === "DELETED") return NextResponse.json({ error: "Beat is deleted" }, { status: 409 });
    // Name, description, flat price and stock lock after the edit window;
    // genre, mood, BPM, key, tags and license tiers don't (explicit ask, 2026-11-11).
    const touchesListing = body.title !== undefined || body.description !== undefined || body.priceKobo !== undefined || body.cap !== undefined;
    if (touchesListing && listingEditState(product.publishedAt, product.upgradeEditAt) === "closed") {
      return NextResponse.json({ error: `Name, description and price can only be changed in the first ${EDIT_WINDOW_HOURS} hours after a beat goes live` }, { status: 403 });
    }

    if (body.licenses) {
      const existing = await db.beatLicense.findMany({ where: { productId: id }, select: { id: true, name: true, _count: { select: { orderItems: true } } } });
      const keep = new Set(body.licenses.map((l) => l.id).filter(Boolean));
      const bad = body.licenses.find((l) => l.id && !existing.some((e) => e.id === l.id));
      if (bad) return NextResponse.json({ error: "One of these licenses no longer exists. Reload and try again." }, { status: 400 });
      // A tier someone bought stays (their order points at it); it can still be edited.
      const sold = existing.find((e) => !keep.has(e.id) && e._count.orderItems > 0);
      if (sold) return NextResponse.json({ error: `"${sold.name}" has been bought, so it can't be removed. You can still edit it.` }, { status: 400 });
      const licenses = body.licenses;
      await db.$transaction(async (tx) => {
        await tx.beatLicense.deleteMany({ where: { productId: id, id: { notIn: [...keep] as string[] } } });
        for (const [order, l] of licenses.entries()) {
          const data = { name: l.name, priceKobo: l.priceKobo, formats: l.formats, isExclusive: l.isExclusive, terms: l.terms, order };
          if (l.id) await tx.beatLicense.update({ where: { id: l.id }, data });
          else await tx.beatLicense.create({ data: { ...data, productId: id } });
        }
        // "From ₦X" is the cheapest tier (same rule as publishing).
        if (licenses.length) await tx.product.update({ where: { id }, data: { priceKobo: Math.min(...licenses.map((l) => l.priceKobo)) } });
      });
    }

    if (body.cap !== undefined) {
      const policy = product.stockPolicy;
      // Same rule as releases (PRD §7.2): lowering a cap is allowed only
      // down to units already sold; raising it or introducing/removing a
      // cap after publish is not, or the sell-out promise means nothing.
      if (!policy || policy.cap === null) {
        return NextResponse.json({ error: "Cannot introduce a cap on an uncapped beat" }, { status: 400 });
      }
      if (body.cap > policy.cap) {
        return NextResponse.json({ error: "Cap can only be lowered, never raised" }, { status: 400 });
      }
      if (body.cap < policy.sold) {
        return NextResponse.json({ error: `Cap cannot go below units already sold (${policy.sold})` }, { status: 400 });
      }
      await db.stockPolicy.update({
        where: { productId: id },
        data: { cap: body.cap, soldOutAt: body.cap === policy.sold ? new Date() : policy.soldOutAt },
      });
    }

    // Older listings' one-time upgrade edit: this save uses it (lib/editWindow.ts).
    const usesUpgrade = touchesListing && listingEditState(product.publishedAt, product.upgradeEditAt) === "upgrade";
    if (usesUpgrade) await db.product.update({ where: { id }, data: { upgradeEditAt: new Date() } });
    const updated = await db.product.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description,
        priceKobo: body.priceKobo,
        beat: {
          update: {
            ...(body.genre !== undefined ? { genre: body.genre } : {}),
            ...(body.mood !== undefined ? { mood: body.mood } : {}),
            ...(body.bpm !== undefined ? { bpm: body.bpm } : {}),
            ...(body.musicalKey !== undefined ? { musicalKey: body.musicalKey || null } : {}),
            ...(body.tags !== undefined ? { tags: [...new Set(body.tags.filter(Boolean))] } : {}),
          },
        },
      },
      include: { beat: true, stockPolicy: true },
    });

    revalidatePath(`/b/${id}`);
    return NextResponse.json({ product: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not update beat" }, { status: 500 });
  }
}

// Delete never removes what a producer bought (same rule as releases) —
// this withdraws the beat from sale/discovery only. Existing Entitlements
// (and the buyer's downloaded master) are untouched.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const product = await loadOwned(id, user.id);
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.product.update({ where: { id }, data: { status: "DELETED", deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Could not delete beat" }, { status: 500 });
  }
}
