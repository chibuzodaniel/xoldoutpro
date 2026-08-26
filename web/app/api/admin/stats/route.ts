import { NextRequest, NextResponse } from "next/server";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

// Moderator-only platform growth snapshot — deliberately just stat tiles,
// no chart (same call as the creator-facing /api/analytics: "the PRD
// requires the metrics, not a visualization"). Counts every User row
// (deletedAt is a soft-delete flag, not a hard delete — an account in its
// 45-day recovery window is still a real signup for growth-tracking
// purposes) except where noted.
export async function GET(req: NextRequest) {
  try {
    await requireModerator(req);

    const now = new Date();
    const since24h = new Date(now.getTime() - DAY_MS);
    const since7d = new Date(now.getTime() - 7 * DAY_MS);
    const since30d = new Date(now.getTime() - 30 * DAY_MS);

    const [totalUsers, deletedUsers, newUsers24h, newUsers7d, newUsers30d, totalModerators, totalCreators] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { deletedAt: { not: null } } }),
      db.user.count({ where: { createdAt: { gte: since24h } } }),
      db.user.count({ where: { createdAt: { gte: since7d } } }),
      db.user.count({ where: { createdAt: { gte: since30d } } }),
      db.user.count({ where: { isModerator: true } }),
      // "Creator" here means "has published at least one listing" — the
      // same bar /api/analytics implicitly uses, not a role flag (there
      // isn't one; anyone can publish).
      db.user.count({ where: { products: { some: { status: { not: "DRAFT" } } } } }),
    ]);

    return NextResponse.json({
      totalUsers,
      activeUsers: totalUsers - deletedUsers,
      deletedUsers,
      newUsers24h,
      newUsers7d,
      newUsers30d,
      totalModerators,
      totalCreators,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
