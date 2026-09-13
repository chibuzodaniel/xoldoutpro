import { NextResponse } from "next/server";
import { getDiscoverData } from "@/lib/discover/getDiscoverData";

// Public JSON mirror of the web (app)/discover page's "all" view, for the
// mobile app — the web page renders this data server-side and never exposed
// it as an API before. Same data, same picks (hero, weekly ranking), just
// serialized instead of rendered to JSX.
export async function GET() {
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
