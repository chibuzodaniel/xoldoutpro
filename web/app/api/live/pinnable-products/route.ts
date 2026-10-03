import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// The creator's own catalog, for the "pin a product" picker on the Go Live
// form (write-up §3: "commerce inside Live"). EVENT is left out — a
// pinnable EVENT product is really one ticket tier, and resolving that back
// to its parent event's own /e/[id] page is more than this picker needs for
// v1; RELEASE/BEAT/MERCH each have one direct product page already.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const products = await db.product.findMany({
      where: { creatorId: user.id, status: "PUBLISHED", type: { in: ["RELEASE", "BEAT", "MERCH"] } },
      select: { id: true, type: true, title: true, priceKobo: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ products });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
