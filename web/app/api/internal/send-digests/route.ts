import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendDigestEmail, type DigestKind } from "@/lib/email";

export const runtime = "nodejs";

const WINDOW_DAYS: Record<DigestKind, number> = { weekly: 7, monthly: 30, yearly: 365 };
const SITE_URL = "https://www.xoldout.app";

// Vercel's Hobby plan caps crons at once/day (same constraint documented on
// sweep-holds) — so this can't run on three separate weekly/monthly/yearly
// schedules directly. One daily trigger instead, which decides for itself
// which digest(s) apply to today: Monday → weekly, the 1st of the month →
// monthly, Jan 1 → yearly. More than one can fire on the same calendar day
// (e.g. a Monday that's also the 1st) — that's fine, they're different content.
function digestKindsForToday(now: Date): DigestKind[] {
  const kinds: DigestKind[] = [];
  if (now.getUTCDay() === 1) kinds.push("weekly");
  if (now.getUTCDate() === 1) kinds.push("monthly");
  if (now.getUTCMonth() === 0 && now.getUTCDate() === 1) kinds.push("yearly");
  return kinds;
}

function ladderUrl(ladder: unknown, size: string) {
  return (ladder as Record<string, string> | null)?.[size] ?? null;
}

function formatNaira(kobo: number) {
  if (kobo === 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// "Best performing song" = the RELEASE product with the most new
// Entitlements (i.e. purchases — the durable fact of a sale, PRD's own
// framing) inside the window. Nothing ranks by plays/likes; sales are the
// one unambiguous "performing" signal already tracked with a timestamp.
async function computeTopSong(windowDays: number) {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const grouped = await db.entitlement.groupBy({
    by: ["productId"],
    where: { createdAt: { gte: since }, product: { type: "RELEASE", status: "PUBLISHED" } },
    _count: { productId: true },
    orderBy: { _count: { productId: "desc" } },
    take: 1,
  });
  if (grouped.length === 0) return null;

  const product = await db.product.findUnique({
    where: { id: grouped[0].productId },
    include: { creator: { select: { displayName: true } }, release: { select: { artworkLadder: true } } },
  });
  if (!product || !product.release) return null;

  return {
    id: product.id,
    title: product.title,
    artistName: product.creator.displayName,
    artworkUrl: ladderUrl(product.release.artworkLadder, "256"),
    href: `${SITE_URL}/r/${product.id}`,
    soldInWindow: grouped[0]._count.productId,
  };
}

// No personalization/ranking model exists yet — "recommended" is honestly
// just all-time top-sellers across Release/Beat/Merch, excluding whichever
// product is already featured as the top song. A blunt default, same
// spirit as the rest of this codebase's undecided-criteria toggles.
async function computeRecommended(excludeProductId: string | null) {
  const topStock = await db.stockPolicy.findMany({
    where: { sold: { gt: 0 }, product: { status: "PUBLISHED", type: { in: ["RELEASE", "BEAT", "MERCH"] } } },
    orderBy: { sold: "desc" },
    take: 8,
    include: {
      product: {
        include: {
          creator: { select: { displayName: true } },
          release: { select: { artworkLadder: true } },
          beat: { select: { coverImageLadder: true } },
          merchItem: { select: { imageLadder: true } },
        },
      },
    },
  });

  return topStock
    .filter((s) => s.productId !== excludeProductId)
    .slice(0, 4)
    .map((s) => {
      const p = s.product;
      const imageUrl =
        p.type === "BEAT"
          ? ladderUrl(p.beat?.coverImageLadder, "256")
          : p.type === "MERCH"
            ? ladderUrl(p.merchItem?.imageLadder, "256")
            : ladderUrl(p.release?.artworkLadder, "256");
      const href = p.type === "BEAT" ? `${SITE_URL}/b/${p.id}` : p.type === "MERCH" ? `${SITE_URL}/m/${p.id}` : `${SITE_URL}/r/${p.id}`;
      return { title: p.title, creatorName: p.creator.displayName, imageUrl, href, priceLabel: formatNaira(p.priceKobo) };
    });
}

// Known gap: sends sequentially, one Resend HTTP call per subscriber per
// digest kind, inside a single invocation — fine at current scale, but
// would need batching/a queue before this list gets into the hundreds
// (risk of hitting the function's execution time limit).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kinds = digestKindsForToday(new Date());
  if (kinds.length === 0) return NextResponse.json({ sent: 0, kinds: [] });

  const subscribers = await db.user.findMany({
    where: { emailDigestSubscribed: true },
    select: { id: true, email: true, displayName: true, unsubscribeToken: true },
  });

  let sent = 0;
  for (const kind of kinds) {
    const topSong = await computeTopSong(WINDOW_DAYS[kind]);
    const recommended = await computeRecommended(topSong?.id ?? null);
    if (!topSong && recommended.length === 0) continue;

    for (const sub of subscribers) {
      let token = sub.unsubscribeToken;
      if (!token) {
        token = randomUUID();
        await db.user.update({ where: { id: sub.id }, data: { unsubscribeToken: token } });
      }
      await sendDigestEmail({
        to: sub.email,
        displayName: sub.displayName,
        kind,
        topSong,
        recommended,
        unsubscribeUrl: `${SITE_URL}/unsubscribe?token=${token}`,
      });
      sent += 1;
    }
  }

  return NextResponse.json({ sent, kinds });
}
