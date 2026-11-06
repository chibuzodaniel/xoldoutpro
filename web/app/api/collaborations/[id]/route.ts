import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications/create";

const bodySchema = z.object({ action: z.enum(["accept", "decline"]) });

async function loadTag(id: string) {
  return db.releaseCollaborator.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      arrangement: true,
      sharePercent: true,
      artistId: true,
      invitedById: true,
      productId: true,
      artist: { select: { handle: true, displayName: true } },
      product: { select: { title: true, creatorId: true, creator: { select: { handle: true } } } },
    },
  });
}

// The featured artist accepts or declines a PENDING request. Accepting is
// what makes the feature official (public credit, and — for a royalty split —
// a share of every sale from now on). A request can be answered only once.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { action } = bodySchema.parse(await req.json());

    const tag = await loadTag(id);
    if (!tag || tag.artistId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const status = action === "accept" ? "ACCEPTED" : "DECLINED";
    const claim = await db.releaseCollaborator.updateMany({
      where: { id, status: "PENDING" },
      data: { status, respondedAt: new Date() },
    });
    if (claim.count === 0) return NextResponse.json({ error: "This request was already answered" }, { status: 409 });

    const terms = tag.arrangement === "ROYALTY_SPLIT" ? `a ${tag.sharePercent}% royalty share` : "credit only";
    await createNotification(tag.product.creatorId, {
      kind: "COLLABORATION",
      title: action === "accept" ? "Feature accepted" : "Feature declined",
      body:
        action === "accept"
          ? `${tag.artist.displayName} accepted the feature on "${tag.product.title}" (${terms}).`
          : `${tag.artist.displayName} declined the feature on "${tag.product.title}".`,
      url: "/profile/collaborations",
    });

    // Public credits are on cached pages — show the change right away.
    revalidatePath(`/r/${tag.productId}`);
    revalidatePath(`/u/${tag.artist.handle}`);
    revalidatePath(`/u/${tag.product.creator.handle}`);
    return NextResponse.json({ status });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// The main artist withdraws a request that hasn't been answered yet. An
// accepted arrangement is a record both sides rely on, so it can't be
// removed here.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const tag = await loadTag(id);
    if (!tag || tag.product.creatorId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const removed = await db.releaseCollaborator.deleteMany({ where: { id, status: "PENDING" } });
    if (removed.count === 0) return NextResponse.json({ error: "Only a pending request can be withdrawn" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
