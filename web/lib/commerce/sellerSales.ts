import { db } from "@/lib/db";

/**
 * Every sale of one seller's products — who bought, which sales were later
 * refunded and why, and for music/beats how much each buyer has played it
 * and whether they downloaded it (explicit ask, 2026-10-15). Shared by the
 * seller's own Analytics (GET /api/analytics/buyers) and the moderator user
 * detail view (lib/commerce/userModeration.ts), so the two never disagree.
 *
 * StockPolicy.sold alone can't explain a seller's count going down: an
 * expired unclaimed gift decrements it (releaseConfirmedUnit), a takedown
 * refund doesn't — refundReason is what tells those apart.
 */
export async function getSellerSales(sellerId: string, take = 200) {
  const soldWhere = { order: { status: { in: ["PAID", "REFUNDED"] as ("PAID" | "REFUNDED")[] } }, product: { creatorId: sellerId } };
  const [items, paidUnits, refundedUnits, refundedByProduct, buyers] = await Promise.all([
    db.orderItem.findMany({
      where: soldWhere,
      orderBy: { order: { createdAt: "desc" } },
      take,
      select: {
        id: true,
        priceKobo: true,
        quantity: true,
        product: { select: { id: true, title: true, type: true } },
        order: {
          select: {
            id: true,
            status: true,
            isGift: true,
            createdAt: true,
            buyer: { select: { id: true, handle: true, displayName: true, avatarUrl: true } },
            gift: { select: { status: true, expiresAt: true, claimedById: true, claimedBy: { select: { handle: true } } } },
          },
        },
      },
    }),
    db.orderItem.aggregate({ where: { ...soldWhere, order: { status: "PAID" } }, _sum: { quantity: true } }),
    db.orderItem.aggregate({ where: { ...soldWhere, order: { status: "REFUNDED" } }, _sum: { quantity: true } }),
    db.orderItem.groupBy({ by: ["productId"], where: { ...soldWhere, order: { status: "REFUNDED" } }, _sum: { quantity: true } }),
    db.order.findMany({
      where: { status: "PAID", items: { some: { product: { creatorId: sellerId } } } },
      distinct: ["buyerId"],
      select: { buyerId: true },
    }),
  ]);

  // The listener of a claimed gift is whoever claimed it, not the giver.
  const listenerOf = (i: (typeof items)[number]) => i.order.gift?.claimedById ?? i.order.buyer.id;
  const audioItems = items.filter((i) => i.product.type === "RELEASE" || i.product.type === "BEAT");
  const listenerIds = [...new Set(audioItems.map(listenerOf))];
  const audioProductIds = [...new Set(audioItems.map((i) => i.product.id))];

  const [plays, downloads] =
    audioItems.length === 0
      ? [[], []]
      : await Promise.all([
          db.trackPlay.groupBy({
            by: ["userId", "productId"],
            where: { userId: { in: listenerIds }, productId: { in: audioProductIds } },
            _count: { _all: true },
          }),
          db.productDownload.findMany({
            where: { userId: { in: listenerIds }, productId: { in: audioProductIds } },
            select: { userId: true, productId: true, kind: true, lastAt: true },
          }),
        ]);
  const playsByKey = new Map(plays.map((p) => [`${p.userId}:${p.productId}`, p._count._all]));
  const downloadsByKey = new Map<string, { offlineAt: Date | null; fileAt: Date | null }>();
  for (const d of downloads) {
    const key = `${d.userId}:${d.productId}`;
    const entry = downloadsByKey.get(key) ?? { offlineAt: null, fileAt: null };
    if (d.kind === "OFFLINE") entry.offlineAt = d.lastAt;
    else entry.fileAt = d.lastAt;
    downloadsByKey.set(key, entry);
  }

  return {
    summary: {
      paidUnits: paidUnits._sum.quantity ?? 0,
      refundedUnits: refundedUnits._sum.quantity ?? 0,
      uniqueBuyers: buyers.length,
    },
    refundedByProduct: new Map(refundedByProduct.map((r) => [r.productId, r._sum.quantity ?? 0])),
    sales: items.map((i) => {
      const isAudio = i.product.type === "RELEASE" || i.product.type === "BEAT";
      const key = `${listenerOf(i)}:${i.product.id}`;
      const dl = downloadsByKey.get(key);
      return {
        id: i.id,
        orderId: i.order.id,
        productId: i.product.id,
        productTitle: i.product.title,
        productType: i.product.type,
        quantity: i.quantity,
        amountKobo: i.priceKobo * i.quantity,
        status: i.order.status,
        createdAt: i.order.createdAt,
        buyer: i.order.buyer,
        isGift: i.order.isGift,
        giftStatus: i.order.gift?.status ?? null,
        giftExpiresAt: i.order.gift?.expiresAt ?? null,
        giftClaimedByHandle: i.order.gift?.claimedBy?.handle ?? null,
        refundReason: refundReason(i.order),
        // null for merch/tickets, where plays/downloads don't apply.
        plays: isAudio ? (playsByKey.get(key) ?? 0) : null,
        downloadedOfflineAt: isAudio ? (dl?.offlineAt ?? null) : null,
        downloadedFileAt: isAudio ? (dl?.fileAt ?? null) : null,
      };
    }),
  };
}

function refundReason(order: { status: string; gift: { status: string } | null }): string | null {
  if (order.status !== "REFUNDED") return null;
  if (order.gift?.status === "EXPIRED") return "Gift never claimed — expired and refunded";
  return "Refunded by moderator / takedown";
}

export type SellerSale = Awaited<ReturnType<typeof getSellerSales>>["sales"][number];
