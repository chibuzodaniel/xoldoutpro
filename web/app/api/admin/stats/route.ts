import { NextRequest, NextResponse } from "next/server";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

type Bucket = { label: string; count: number };

// Buckets a list of signup timestamps into fixed windows for one
// granularity. Day/week are trailing windows anchored to now (sidesteps
// picking a week-start convention); month/year are true calendar periods
// (a 30-day "month" bucket would misrepresent February). All in UTC so the
// server's local timezone never shifts which bucket a signup lands in.
function bucketSignups(dates: Date[], granularity: "day" | "week" | "month" | "year"): Bucket[] {
  const now = new Date();
  const starts: Date[] = [];

  if (granularity === "day") {
    for (let i = 29; i >= 0; i--) starts.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)));
  } else if (granularity === "week") {
    for (let i = 11; i >= 0; i--) starts.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i * 7 - 6)));
  } else if (granularity === "month") {
    for (let i = 11; i >= 0; i--) starts.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)));
  } else {
    const earliestYear = dates.length ? Math.min(...dates.map((d) => d.getUTCFullYear())) : now.getUTCFullYear();
    for (let y = earliestYear; y <= now.getUTCFullYear(); y++) starts.push(new Date(Date.UTC(y, 0, 1)));
  }

  function bucketEnd(i: number): Date {
    if (i + 1 < starts.length) return starts[i + 1];
    const s = starts[i];
    if (granularity === "day") return new Date(s.getTime() + DAY_MS);
    if (granularity === "week") return new Date(s.getTime() + 7 * DAY_MS);
    if (granularity === "month") return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1));
    return new Date(Date.UTC(s.getUTCFullYear() + 1, 0, 1));
  }

  function label(s: Date): string {
    if (granularity === "day" || granularity === "week") {
      return s.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    }
    if (granularity === "month") return s.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
    return String(s.getUTCFullYear());
  }

  return starts.map((start, i) => {
    const end = bucketEnd(i);
    return { label: label(start), count: dates.filter((d) => d >= start && d < end).length };
  });
}

// Moderator-only platform growth snapshot. Counts every User row
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

    const [totalUsers, deletedUsers, newUsers24h, newUsers7d, newUsers30d, totalModerators, totalCreators, signupDates] =
      await Promise.all([
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
        // Bucketing happens in JS below, not SQL GROUP BY — at this scale
        // (tens to low-thousands of users) a single unbounded fetch of just
        // the timestamps is simpler than four separate date_trunc queries,
        // one per granularity, and just as cheap.
        db.user.findMany({ select: { createdAt: true } }),
      ]);

    const dates = signupDates.map((u) => u.createdAt);

    return NextResponse.json({
      totalUsers,
      activeUsers: totalUsers - deletedUsers,
      deletedUsers,
      newUsers24h,
      newUsers7d,
      newUsers30d,
      totalModerators,
      totalCreators,
      growth: {
        day: bucketSignups(dates, "day"),
        week: bucketSignups(dates, "week"),
        month: bucketSignups(dates, "month"),
        year: bucketSignups(dates, "year"),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
