import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { InvalidPromotedItemError, resolvePromotedItem } from "@/lib/commerce/billboards";

// Status poll for app/(app)/billboards/checkout-callback/page.tsx, same
// role as GET /api/orders/[id] for the Order checkout callback.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const billboard = await db.billboard.findUnique({ where: { id } });
    if (!billboard || billboard.creatorId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ billboard });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const patchSchema = z.object({
  promoted: z.object({ kind: z.enum(["RELEASE", "BEAT", "MERCH", "EVENT"]), id: z.string().min(1) }).nullable(),
});

// Change what an existing billboard links to (or clear it back to the
// profile) — allowed any time before it's over, including while live, since
// it only changes the tap target, not the reviewed artwork.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { promoted } = patchSchema.parse(await req.json());

    const billboard = await db.billboard.findUnique({ where: { id } });
    if (!billboard || billboard.creatorId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const isOver =
      billboard.status === "REJECTED" ||
      billboard.status === "REMOVED" ||
      (billboard.status === "ACTIVE" && billboard.expiresAt !== null && billboard.expiresAt <= new Date());
    if (isOver) return NextResponse.json({ error: "This billboard has ended" }, { status: 409 });

    const ids = await resolvePromotedItem(user.id, promoted);
    const updated = await db.billboard.update({ where: { id }, data: ids });
    return NextResponse.json({ billboard: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    if (err instanceof InvalidPromotedItemError) {
      return NextResponse.json({ error: "Pick one of your own published songs, beats, merch or events." }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
