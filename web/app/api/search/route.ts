import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PRD §6: search across release titles, creator names, and handles.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ products: [], creators: [] });

  const [products, creators] = await Promise.all([
    db.product.findMany({
      where: { type: "RELEASE", status: "PUBLISHED", title: { contains: q, mode: "insensitive" } },
      include: {
        creator: { select: { handle: true, displayName: true } },
        release: { select: { artworkLadder: true, releaseType: true } },
        stockPolicy: { select: { cap: true, sold: true, soldOutAt: true } },
      },
      take: 20,
    }),
    db.user.findMany({
      where: { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { handle: { contains: q, mode: "insensitive" } }] },
      select: { id: true, handle: true, displayName: true, avatarUrl: true },
      take: 10,
    }),
  ]);

  return NextResponse.json({ products, creators });
}
