import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { getOptionalUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { COMMUNITY_CATEGORIES, DIRECTORY_FILTERS, type DirectoryFilter } from "@/lib/communities/constants";

// Socials → Communities directory (v2, design/v2-prototype). Every Fanbase is
// a community. Public: signed-out visitors can browse too. One query plus one
// for the viewer's own status — nothing per row.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim().slice(0, 60) || null;
  const filterParam = sp.get("filter");
  const filter = DIRECTORY_FILTERS.some((f) => f.key === filterParam) ? (filterParam as DirectoryFilter) : null;
  const categoryParam = sp.get("category");
  const category = (COMMUNITY_CATEGORIES as readonly string[]).includes(categoryParam ?? "") ? categoryParam : null;

  const livePaidPlan = { priceKobo: { gt: 0 }, archivedAt: null };
  const where: Prisma.FanbaseGroupWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { handle: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(category ? { category } : {}),
    ...(filter === "featured" ? { isFeatured: true } : {}),
    ...(filter === "paid" ? { plans: { some: livePaidPlan } } : {}),
    ...(filter === "free" ? { plans: { none: livePaidPlan } } : {}),
  };
  const orderBy: Prisma.FanbaseGroupOrderByWithRelationInput[] =
    filter === "new"
      ? [{ createdAt: "desc" }]
      : filter === "trending"
        ? [{ memberships: { _count: "desc" } }, { createdAt: "desc" }]
        : [{ isFeatured: "desc" }, { memberships: { _count: "desc" } }, { createdAt: "desc" }];

  const groups = await db.fanbaseGroup.findMany({
    where,
    orderBy,
    take: 40,
    select: {
      id: true,
      handle: true,
      name: true,
      description: true,
      coverImageUrl: true,
      bannerUrl: true,
      category: true,
      isFeatured: true,
      isVerified: true,
      visibility: true,
      creator: { select: { displayName: true, handle: true } },
      _count: { select: { memberships: true } },
      plans: { where: { archivedAt: null }, select: { priceKobo: true } },
    },
  });

  const user = await getOptionalUser(req);
  const ids = groups.map((g) => g.id);
  const [mine, requests] = user
    ? await Promise.all([
        db.membership.findMany({ where: { userId: user.id, groupId: { in: ids } }, select: { groupId: true, expiresAt: true } }),
        db.joinRequest.findMany({ where: { userId: user.id, groupId: { in: ids }, status: { in: ["PENDING", "APPROVED"] } }, select: { groupId: true, status: true } }),
      ])
    : [[], []];
  const now = Date.now();
  const memberOf = new Map(mine.map((m) => [m.groupId, !m.expiresAt || m.expiresAt.getTime() > now]));
  const requestOf = new Map(requests.map((r) => [r.groupId, r.status]));

  return NextResponse.json({
    communities: groups.map((g) => {
      const paid = g.plans.filter((p) => p.priceKobo > 0).map((p) => p.priceKobo);
      return {
        id: g.id,
        handle: g.handle,
        name: g.name,
        description: g.description,
        logoUrl: g.coverImageUrl,
        bannerUrl: g.bannerUrl,
        category: g.category,
        isFeatured: g.isFeatured,
        isVerified: g.isVerified,
        isPrivate: g.visibility === "REQUEST_TO_JOIN",
        owner: g.creator,
        memberCount: g._count.memberships,
        isPaid: paid.length > 0,
        hasFreePlan: g.plans.length === 0 || g.plans.some((p) => p.priceKobo === 0),
        fromPriceKobo: paid.length ? Math.min(...paid) : null,
        myStatus: memberOf.get(g.id) ? "member" : memberOf.has(g.id) ? "expired" : requestOf.get(g.id) === "PENDING" ? "pending" : requestOf.get(g.id) === "APPROVED" ? "approved" : null,
      };
    }),
  });
}
