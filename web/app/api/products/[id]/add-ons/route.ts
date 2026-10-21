import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalUser, requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  addOnInputSchema,
  prepareAddOns,
  createAddOns,
  assertAddOnRoom,
  canAccessAddOns,
  listAddOnsFor,
  AddOnError,
} from "@/lib/commerce/addOns";

// Creative Add-ons for one release (lib/commerce/addOns.ts).
//   GET    — what's included; signed links / YouTube ids only for a buyer or the creator
//   POST   — creator adds extras to an already-published release
//   DELETE — creator removes one (?addOnId=)
// Fetched once when the release page opens — never polled.

async function loadRelease(id: string) {
  return db.product.findUnique({ where: { id }, select: { id: true, creatorId: true, type: true, status: true, addOnCount: true } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const product = await loadRelease(id);
    if (!product || product.type !== "RELEASE" || product.status === "DELETED") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (product.addOnCount === 0) return NextResponse.json({ addOns: [], unlocked: false, isCreator: false });

    const user = await getOptionalUser(req);
    const unlocked = await canAccessAddOns(user?.id ?? null, product);
    return NextResponse.json({ addOns: await listAddOnsFor(id, unlocked), unlocked, isCreator: user?.id === product.creatorId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not load extras" }, { status: 500 });
  }
}

const postSchema = z.object({ addOns: z.array(addOnInputSchema).min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const product = await loadRelease(id);
    if (!product || product.type !== "RELEASE" || product.status === "DELETED" || product.creatorId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { addOns } = postSchema.parse(await req.json());
    assertAddOnRoom(product.addOnCount, addOns.length);
    const last = await db.productAddOn.findFirst({ where: { productId: id }, orderBy: { order: "desc" }, select: { order: true } });
    const rows = await prepareAddOns(user.id, addOns, (last?.order ?? -1) + 1);
    await db.$transaction((tx) => createAddOns(tx, id, rows));
    return NextResponse.json({ addOns: await listAddOnsFor(id, true) }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof AddOnError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid extras" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not add extras" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const addOnId = req.nextUrl.searchParams.get("addOnId");
    const product = await loadRelease(id);
    if (!product || product.creatorId !== user.id || !addOnId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // The R2 object is left in place: anyone who already downloaded it keeps
    // their copy either way, and a stray file costs far less than a delete
    // that races a buyer's in-flight download.
    await db.$transaction(async (tx) => {
      const removed = await tx.productAddOn.deleteMany({ where: { id: addOnId, productId: id } });
      if (removed.count > 0) await tx.product.update({ where: { id }, data: { addOnCount: { decrement: removed.count } } });
    });
    return NextResponse.json({ addOns: await listAddOnsFor(id, true) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Could not remove extra" }, { status: 500 });
  }
}
