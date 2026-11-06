import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Featured artists & revenue sharing (explicit ask, 2026-11-06): every
// release this user is a party to — as main artist or featured artist — with
// the full recorded arrangement and what each party has earned from it.
// "The agreed arrangement should be recorded and accessible to both parties."
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);

    const products = await db.product.findMany({
      where: {
        type: "RELEASE",
        status: { not: "DELETED" },
        OR: [{ creatorId: user.id, collaborators: { some: {} } }, { collaborators: { some: { artistId: user.id } } }],
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        creatorId: true,
        createdAt: true,
        creator: { select: { id: true, handle: true, displayName: true, avatarUrl: true } },
        release: { select: { artworkLadder: true } },
        collaborators: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            arrangement: true,
            sharePercent: true,
            status: true,
            createdAt: true,
            respondedAt: true,
            artist: { select: { id: true, handle: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    });

    // What each party has earned per release, from paid (non-refunded)
    // orders — one grouped query, not one per release. For the main artist
    // that's their net (sale − commission − royalty shares); for a featured
    // artist it's their royalty credits.
    const ids = products.map((p) => p.id);
    const earnings =
      ids.length === 0
        ? []
        : await db.$queryRaw<{ userId: string; productId: string; kobo: number }[]>`
            SELECT w."userId", oi."productId", COALESCE(SUM(w."amountKobo"), 0)::int AS kobo
            FROM "WalletLedgerEntry" w
            JOIN "Order" o ON o."id" = w."orderId"
            JOIN "OrderItem" oi ON oi."orderId" = o."id"
            WHERE o."status" = 'PAID'
              AND oi."productId" = ANY(${ids})
              AND w."kind" IN ('SALE_CREDIT', 'COMMISSION_FEE', 'ROYALTY_SPLIT_FEE', 'ROYALTY_SPLIT_CREDIT')
            GROUP BY w."userId", oi."productId"
          `;
    const earned = (userId: string, productId: string) =>
      earnings.find((e) => e.userId === userId && e.productId === productId)?.kobo ?? 0;

    const releases = products.map((p) => {
      const activeRoyalty = p.collaborators.filter((c) => c.status !== "DECLINED" && c.arrangement === "ROYALTY_SPLIT");
      return {
        product: {
          id: p.id,
          title: p.title,
          artworkUrl: (p.release?.artworkLadder as Record<string, string> | null)?.["256"] ?? null,
          createdAt: p.createdAt,
        },
        mainArtist: p.creator,
        isMine: p.creatorId === user.id,
        // Main share = 100 − every non-declined royalty share, so the
        // recorded split always totals 100%. A pending share isn't paid out
        // yet (the main artist keeps it until it's accepted).
        mainSharePercent: 100 - activeRoyalty.reduce((sum, c) => sum + c.sharePercent, 0),
        // Earnings are private: the main artist sees everyone's (they pay
        // the shares), a featured artist sees only their own.
        mainEarnedKobo: p.creatorId === user.id ? earned(p.creatorId, p.id) : null,
        collaborators: p.collaborators.map((c) => ({
          ...c,
          earnedKobo: p.creatorId === user.id || c.artist.id === user.id ? earned(c.artist.id, p.id) : null,
        })),
      };
    });

    const pendingForMe = products.reduce(
      (n, p) => n + p.collaborators.filter((c) => c.artist.id === user.id && c.status === "PENDING").length,
      0,
    );
    return NextResponse.json({ releases, pendingForMe });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
