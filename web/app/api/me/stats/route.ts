import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);

    const [fans, musicReleases, beats, merch, events, salesAgg, pendingFanbaseRequests] = await Promise.all([
      db.follow.count({ where: { followedId: user.id } }),
      db.product.count({ where: { creatorId: user.id, type: "RELEASE", status: { not: "DELETED" } } }),
      db.product.count({ where: { creatorId: user.id, type: "BEAT", status: { not: "DELETED" } } }),
      db.product.count({ where: { creatorId: user.id, type: "MERCH", status: { not: "DELETED" } } }),
      db.event.count({ where: { creatorId: user.id, status: { not: "DELETED" } } }),
      db.stockPolicy.aggregate({
        where: { product: { creatorId: user.id } },
        _sum: { sold: true },
      }),
      db.joinRequest.count({
        where: { status: "PENDING", group: { memberships: { some: { userId: user.id, role: "ADMIN" } } } },
      }),
    ]);

    return NextResponse.json({
      fans,
      sales: salesAgg._sum.sold ?? 0,
      catalog: { music: musicReleases, beats, events, merch },
      pendingFanbaseRequests,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
