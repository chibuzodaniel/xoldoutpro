import { createHmac } from "crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Site-visit tracking for the moderator dashboard (prisma/schema.prisma's
// SiteVisitorDay comment). Privacy: the visitor id is an HMAC of IP + user
// agent under VISIT_HASH_SECRET — the raw IP is never stored, and without
// the secret the hash can't be reversed by brute-forcing the IP space.

const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|pingdom|uptime|curl|wget|python-requests/i;

function hashSecret(): string | null {
  const secret = process.env.VISIT_HASH_SECRET;
  if (secret) return secret;
  // Dev convenience only — production must set a real secret, otherwise
  // visits simply aren't recorded (see recordVisit's caller).
  return process.env.NODE_ENV === "production" ? null : "dev-only-visit-hash-secret";
}

export function isBotUserAgent(ua: string | null): boolean {
  return !ua || BOT_UA.test(ua);
}

function utcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Counts one page view: creates the visitor's row for today, or bumps its pageViews. Returns false when not recorded (no secret configured). */
export async function recordVisit(args: { ip: string; userAgent: string; country: string | null }): Promise<boolean> {
  const secret = hashSecret();
  if (!secret) return false;
  const visitorHash = createHmac("sha256", secret).update(`${args.ip}|${args.userAgent}`).digest("hex");
  const day = utcDay();
  const country = /^[A-Z]{2}$/.test(args.country ?? "") ? args.country! : "ZZ";

  await db.siteVisitorDay.upsert({
    where: { day_visitorHash: { day, visitorHash } },
    create: { day, visitorHash, country },
    update: { pageViews: { increment: 1 } },
  });
  return true;
}

export type VisitPeriod = "today" | "7d" | "30d" | "all";
export type VisitTotals = { uniqueVisitors: number; pageViews: number };

const PERIOD_DAYS: Record<Exclude<VisitPeriod, "all">, number> = { today: 1, "7d": 7, "30d": 30 };

function periodStart(period: VisitPeriod): Date | null {
  if (period === "all") return null;
  const today = utcDay();
  return new Date(today.getTime() - (PERIOD_DAYS[period] - 1) * 24 * 60 * 60 * 1000);
}

function whereSql(period: VisitPeriod, country: string | null) {
  const start = periodStart(period);
  const conditions: Prisma.Sql[] = [];
  if (start) conditions.push(Prisma.sql`"day" >= ${start}::date`);
  if (country) conditions.push(Prisma.sql`"country" = ${country}`);
  return conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
}

async function totals(period: VisitPeriod, country: string | null): Promise<VisitTotals> {
  // Uniques across days are COUNT(DISTINCT visitorHash) — the same browser
  // on Monday and Tuesday is one weekly visitor, not two.
  const rows = await db.$queryRaw<{ uniques: bigint; views: bigint | null }[]>`
    SELECT COUNT(DISTINCT "visitorHash") AS uniques, SUM("pageViews") AS views
    FROM "SiteVisitorDay" ${whereSql(period, country)}`;
  return { uniqueVisitors: Number(rows[0]?.uniques ?? 0), pageViews: Number(rows[0]?.views ?? 0) };
}

export async function getVisitDashboard(args: { country: string | null; breakdownPeriod: VisitPeriod }) {
  const { country, breakdownPeriod } = args;
  const [today, week, month, allTime, daily, byCountry, countries] = await Promise.all([
    totals("today", country),
    totals("7d", country),
    totals("30d", country),
    totals("all", country),
    // Last 30 days, one point per UTC day (days with no visits are filled in client-side).
    db.$queryRaw<{ day: Date; uniques: bigint; views: bigint }[]>`
      SELECT "day", COUNT(*) AS uniques, SUM("pageViews") AS views
      FROM "SiteVisitorDay" ${whereSql("30d", country)}
      GROUP BY "day" ORDER BY "day"`,
    db.$queryRaw<{ country: string; uniques: bigint; views: bigint }[]>`
      SELECT "country", COUNT(DISTINCT "visitorHash") AS uniques, SUM("pageViews") AS views
      FROM "SiteVisitorDay" ${whereSql(breakdownPeriod, null)}
      GROUP BY "country" ORDER BY uniques DESC, views DESC`,
    // Every country ever seen, for the filter dropdown.
    db.$queryRaw<{ country: string }[]>`SELECT DISTINCT "country" FROM "SiteVisitorDay" ORDER BY "country"`,
  ]);

  return {
    totals: { today, week, month, allTime },
    daily: daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), uniqueVisitors: Number(d.uniques), pageViews: Number(d.views) })),
    byCountry: byCountry.map((c) => ({ country: c.country, uniqueVisitors: Number(c.uniques), pageViews: Number(c.views) })),
    countries: countries.map((c) => c.country),
  };
}
