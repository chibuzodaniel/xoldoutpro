import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

async function loadOwned(id: string, userId: string) {
  const collection = await db.collection.findUnique({ where: { id } });
  if (!collection || collection.userId !== userId) return null;
  return collection;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const collection = await loadOwned(id, user.id);
    if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const items = await db.collectionItem.findMany({
      where: { collectionId: id },
      orderBy: { addedAt: "desc" },
      include: {
        entitlement: {
          include: {
            product: {
              include: {
                creator: { select: { handle: true, displayName: true } },
                release: { include: { tracks: { orderBy: { order: "asc" } } } },
                beat: true,
                merchItem: true,
                ticketTier: { include: { event: true } },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      collection: { id: collection.id, name: collection.name },
      items: items.map((i) => ({ entitlement: i.entitlement, addedAt: i.addedAt })),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const patchSchema = z.object({ name: z.string().trim().min(1).max(60) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { name } = patchSchema.parse(await req.json());
    const collection = await loadOwned(id, user.id);
    if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await db.collection.update({ where: { id }, data: { name } });
    return NextResponse.json({ collection: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const collection = await loadOwned(id, user.id);
    if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.collection.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
