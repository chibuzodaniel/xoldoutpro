import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);

    const [fans, musicReleases, salesAgg] = await Promise.all([
      db.follow.count({ where: { followedId: user.id } }),
      db.product.count({ where: { creatorId: user.id, type: "RELEASE", status: { not: "DELETED" } } }),
      db.stockPolicy.aggregate({
        where: { product: { creatorId: user.id } },
        _sum: { sold: true },
      }),
    ]);

    return NextResponse.json({
      fans,
      sales: salesAgg._sum.sold ?? 0,
      catalog: { music: musicReleases, beats: 0, events: 0, merch: 0 },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
