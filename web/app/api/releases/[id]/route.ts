import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listingEditState, EDIT_WINDOW_HOURS } from "@/lib/editWindow";
import { publicUrlFor } from "@/lib/storage/r2";
import { GENRE_SLUGS, MIN_GENRES, MAX_GENRES } from "@/lib/music/tags";
import { PAY_WHAT_YOU_WANT_MIN_KOBO } from "@/lib/commerce/constants";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  priceKobo: z.number().int().min(0).optional(),
  cap: z.number().int().positive().optional(),
  // New cover (explicit ask, 2026-11-04): a ladder from
  // /api/uploads/artwork/finalize — checked below to be this creator's own upload.
  artworkLadder: z.record(z.string(), z.string().url()).optional(),
  // Genres only change where a release is found, so (like PUT .../tags)
  // they stay editable after the edit window closes.
  genres: z.array(z.enum(GENRE_SLUGS)).min(MIN_GENRES, "Pick at least one genre").max(MAX_GENRES).optional(),
  // Structure (Edit release, explicit ask 2026-11-11): editable any time,
  // like genres. A single has exactly one track.
  releaseType: z.enum(["SINGLE", "EP", "ALBUM"]).optional(),
});

async function loadOwned(id: string, userId: string) {
  const product = await db.product.findUnique({ where: { id }, include: { stockPolicy: true } });
  if (!product || product.creatorId !== userId) return null;
  return product;
}

// One edit for a published release (title, description, price, cap, cover,
// genres) — what the Edit button on the release page saves.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const product = await loadOwned(id, user.id);
    if (!product || product.type !== "RELEASE") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (product.status === "DELETED") return NextResponse.json({ error: "Release is deleted" }, { status: 409 });

    const touchesListing =
      body.title !== undefined || body.description !== undefined || body.priceKobo !== undefined || body.cap !== undefined || body.artworkLadder !== undefined;
    if (touchesListing && listingEditState(product.publishedAt, product.upgradeEditAt) === "closed") {
      return NextResponse.json(
        { error: `Name, price and cover can only be changed in the first ${EDIT_WINDOW_HOURS} hours after release` },
        { status: 403 },
      );
    }

    // On a "let fans pay anything" release the price is the minimum a fan may
    // pay — it can be raised, but never below the ₦500 floor.
    if (product.payWhatYouWant && body.priceKobo !== undefined && body.priceKobo < PAY_WHAT_YOU_WANT_MIN_KOBO) {
      return NextResponse.json(
        { error: `The minimum price on a pay-anything release is ₦${PAY_WHAT_YOU_WANT_MIN_KOBO / 100}` },
        { status: 400 },
      );
    }

    if (body.artworkLadder) {
      const ownPrefix = publicUrlFor(`artwork/${user.id}/`);
      const urls = Object.values(body.artworkLadder);
      if (urls.length === 0 || urls.some((u) => !u.startsWith(ownPrefix))) {
        return NextResponse.json({ error: "Upload the new cover again" }, { status: 400 });
      }
    }

    if (body.cap !== undefined) {
      const policy = product.stockPolicy;
      // PRD §7.2: lowering a cap is allowed only down to units already sold;
      // raising it — or introducing/removing a cap after publish — is not,
      // because that would make the sell-out promise meaningless.
      if (!policy || policy.cap === null) {
        return NextResponse.json({ error: "Cannot introduce a cap on an uncapped release" }, { status: 400 });
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

    if (body.releaseType === "SINGLE") {
      const trackCount = await db.track.count({ where: { releaseId: id } });
      if (trackCount !== 1) return NextResponse.json({ error: "A single has exactly one track. Pick EP or Album for this release." }, { status: 400 });
    }

    // Older listings' one-time upgrade edit: this save uses it (lib/editWindow.ts).
    const usesUpgrade = touchesListing && listingEditState(product.publishedAt, product.upgradeEditAt) === "upgrade";
    if (usesUpgrade) await db.product.update({ where: { id }, data: { upgradeEditAt: new Date() } });

    const releaseData = {
      ...(body.artworkLadder ? { artworkLadder: body.artworkLadder } : {}),
      ...(body.releaseType ? { releaseType: body.releaseType } : {}),
      ...(body.genres ? { genres: [...new Set(body.genres)] } : {}),
    };
    const updated = await db.product.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description,
        priceKobo: body.priceKobo,
        ...(Object.keys(releaseData).length ? { release: { update: releaseData } } : {}),
      },
      include: { release: { include: { tracks: true } }, stockPolicy: true },
    });

    // The release page is cached (revalidate = 120) — show the edit right away.
    revalidatePath(`/r/${id}`);
    return NextResponse.json({ product: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid changes" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not update release" }, { status: 500 });
  }
}

// PRD §7.1 decision: delete never removes what a fan bought. This withdraws
// the item from sale and discovery only — existing Entitlement rows (and the
// buyer's downloaded copy) are untouched. Stripping purchased content would
// be a refund event, not a delete, and is handled separately.
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
    return NextResponse.json({ error: "Could not delete release" }, { status: 500 });
  }
}
