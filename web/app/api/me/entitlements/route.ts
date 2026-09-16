import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

// A separate, always-dynamic endpoint rather than folding `entitled` into
// Discover/Search/creator-profile responses — those are ISR-cached and
// shared across every visitor, so baking one user's ownership into them
// would leak it into the next visitor's cached page.
export async function GET(req: NextRequest) {
  const user = await getOptionalUser(req);
  if (!user) return NextResponse.json({ entitled: [] });

  const ids = (req.nextUrl.searchParams.get("productIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 200);
  if (ids.length === 0) return NextResponse.json({ entitled: [] });

  const rows = await db.entitlement.findMany({
    where: { userId: user.id, productId: { in: ids }, revokedAt: null },
    select: { productId: true },
  });
  return NextResponse.json({ entitled: rows.map((r) => r.productId) });
}
