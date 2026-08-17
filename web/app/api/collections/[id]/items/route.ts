import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const bodySchema = z.object({ entitlementId: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { entitlementId } = bodySchema.parse(await req.json());

    const collection = await db.collection.findUnique({ where: { id } });
    if (!collection || collection.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const entitlement = await db.entitlement.findUnique({ where: { id: entitlementId } });
    if (!entitlement || entitlement.userId !== user.id || entitlement.revokedAt) {
      return NextResponse.json({ error: "You don't own that" }, { status: 403 });
    }

    await db.collectionItem.upsert({
      where: { collectionId_entitlementId: { collectionId: id, entitlementId } },
      update: {},
      create: { collectionId: id, entitlementId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
