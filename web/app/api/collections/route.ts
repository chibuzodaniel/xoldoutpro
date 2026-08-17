import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

function coverUrl(entitlement: {
  product: {
    release: { artworkLadder: unknown } | null;
    beat: { coverImageLadder: unknown } | null;
    merchItem: { imageLadder: unknown } | null;
  };
}) {
  const ladder =
    (entitlement.product.release?.artworkLadder as Record<string, string> | undefined) ??
    (entitlement.product.beat?.coverImageLadder as Record<string, string> | undefined) ??
    (entitlement.product.merchItem?.imageLadder as Record<string, string> | undefined);
  return ladder?.["256"] ?? null;
}

// PRD §10 Phase 2: user-organised groupings of what they own. A thin
// grouping over Entitlement — deleting a Collection never touches ownership.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const collections = await db.collection.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          take: 4,
          orderBy: { addedAt: "desc" },
          include: {
            entitlement: {
              include: { product: { include: { release: true, beat: true, merchItem: true } } },
            },
          },
        },
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json({
      collections: collections.map((c) => ({
        id: c.id,
        name: c.name,
        createdAt: c.createdAt,
        itemCount: c._count.items,
        covers: c.items.map((item) => coverUrl(item.entitlement)).filter((u): u is string => Boolean(u)),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const createSchema = z.object({ name: z.string().trim().min(1).max(60) });

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { name } = createSchema.parse(await req.json());
    const collection = await db.collection.create({ data: { userId: user.id, name } });
    return NextResponse.json({ collection: { id: collection.id, name: collection.name, createdAt: collection.createdAt, itemCount: 0, covers: [] } }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
