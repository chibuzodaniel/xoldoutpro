import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/session";
import { requireModeratorPanel } from "@/lib/moderation/panelAccess";
import { db } from "@/lib/db";

// Moderator "Communities" panel (v2 part 3): every community with owner,
// members, paid plans, featured/suspended state and open reports. Search by
// name/handle. Two queries, none per row.
export async function GET(req: NextRequest) {
  try {
    await requireModeratorPanel(req, "communities");
    const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 60);
    const groups = await db.fanbaseGroup.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { handle: { contains: q, mode: "insensitive" } }] } : {},
      orderBy: [{ suspendedAt: { sort: "desc", nulls: "last" } }, { isFeatured: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        name: true,
        handle: true,
        category: true,
        isFeatured: true,
        suspendedAt: true,
        createdAt: true,
        creator: { select: { handle: true, displayName: true } },
        _count: { select: { memberships: true } },
        plans: { where: { archivedAt: null, priceKobo: { gt: 0 } }, select: { id: true } },
      },
    });
    const ids = groups.map((g) => g.id);
    const reports = ids.length
      ? await db.report.groupBy({ by: ["groupId"], where: { groupId: { in: ids }, status: { not: "RESOLVED" } }, _count: { _all: true } })
      : [];
    const reportsBy = new Map(reports.map((r) => [r.groupId, r._count._all]));
    return NextResponse.json({
      communities: groups.map((g) => ({
        id: g.id,
        name: g.name,
        handle: g.handle,
        category: g.category,
        isFeatured: g.isFeatured,
        suspendedAt: g.suspendedAt,
        createdAt: g.createdAt,
        owner: g.creator,
        memberCount: g._count.memberships,
        paidPlans: g.plans.length,
        openReports: reportsBy.get(g.id) ?? 0,
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
