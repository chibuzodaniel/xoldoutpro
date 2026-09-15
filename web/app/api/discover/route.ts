import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDiscoverData, discoverCardInclude } from "@/lib/discover/getDiscoverData";

const VALID_TYPES = ["RELEASE", "BEAT", "EVENT", "MERCH"] as const;
type CategoryType = (typeof VALID_TYPES)[number];

// Public JSON mirror of the web (app)/discover page — both the untyped
// "all" view and, via ?type=, the same single-category views the page's
// own CategoryTabs switch to (app/(app)/discover/page.tsx's activeType
// branches). Kept as one route/one shape (not a separate endpoint) so
// mobile's CategoryTabs can hit exactly what the web page itself queries.
export async function GET(req: NextRequest) {
  const typeParam = req.nextUrl.searchParams.get("type");
  const activeType = (VALID_TYPES as readonly string[]).includes(typeParam ?? "") ? (typeParam as CategoryType) : null;

  if (activeType === "EVENT") {
    const events = await db.event.findMany({
      where: { status: "PUBLISHED" },
      include: { tiers: { select: { product: { select: { priceKobo: true, stockPolicy: true } } } } },
      orderBy: { startsAt: "asc" },
      take: 60,
    });
    return NextResponse.json({
      category: {
        type: "EVENT",
        events: events.map((ev) => ({
          id: ev.id,
          title: ev.title,
          coverImageLadder: ev.coverImageLadder,
          startsAt: ev.startsAt,
          tiers: ev.tiers.map((t) => ({ priceKobo: t.product.priceKobo, stockPolicy: t.product.stockPolicy })),
        })),
      },
    });
  }

  if (activeType) {
    const products = await db.product.findMany({
      where: { type: activeType, status: "PUBLISHED" },
      include: discoverCardInclude,
      orderBy: { publishedAt: "desc" },
      take: 60,
    });
    return NextResponse.json({ category: { type: activeType, products } });
  }

  const { hero, heroWeeklySold, newReleasesBelowHero, recommended, weeklyTopCreators, topBeats, upcomingEvents, merchItems, creators } =
    await getDiscoverData();

  return NextResponse.json({
    hero,
    heroWeeklySold,
    newReleasesBelowHero,
    recommended,
    weeklyTopCreators,
    topBeats,
    merchItems,
    creators,
    upcomingEvents: upcomingEvents.map((ev) => ({
      id: ev.id,
      title: ev.title,
      coverImageLadder: ev.coverImageLadder,
      startsAt: ev.startsAt,
      tiers: ev.tiers.map((t) => ({ priceKobo: t.product.priceKobo, stockPolicy: t.product.stockPolicy })),
    })),
  });
}
