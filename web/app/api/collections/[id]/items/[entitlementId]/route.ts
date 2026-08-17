import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; entitlementId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, entitlementId } = await params;

    const collection = await db.collection.findUnique({ where: { id } });
    if (!collection || collection.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.collectionItem.delete({ where: { collectionId_entitlementId: { collectionId: id, entitlementId } } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
