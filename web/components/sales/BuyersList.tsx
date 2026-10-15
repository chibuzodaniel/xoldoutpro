"use client";

import Link from "next/link";

export type BuyerSale = {
  id: string;
  productTitle: string;
  productType: string;
  quantity: number;
  amountKobo?: number; // moderator view only — Analytics stays money-free (PRD §13)
  status: string;
  createdAt: string;
  buyer: { id: string; handle: string; displayName: string };
  isGift: boolean;
  giftStatus: string | null;
  giftExpiresAt: string | null;
  giftClaimedByHandle: string | null;
  refundReason: string | null;
  plays: number | null;
  downloadedOfflineAt: string | null;
  downloadedFileAt: string | null;
};

export type BuyersSummary = { paidUnits: number; refundedUnits: number; uniqueBuyers: number };

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });

// Who bought a seller's products, refunds included (explicit ask,
// 2026-10-15) — rendered by both the seller's own Analytics page and the
// moderator user detail view (UsersListPanel), from the same
// lib/commerce/sellerSales.ts data. onBuyerClick lets the moderator view
// open the buyer's own detail page; without it the buyer links to their
// public profile.
export function BuyersList({
  summary,
  sales,
  onBuyerClick,
}: {
  summary: BuyersSummary;
  sales: BuyerSale[];
  onBuyerClick?: (buyerId: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <p className="text-[11px] text-ink-3">Units sold</p>
          <p className="text-sm font-semibold">{summary.paidUnits}</p>
        </div>
        <div>
          <p className="text-[11px] text-ink-3">Refunded</p>
          <p className={`text-sm font-semibold ${summary.refundedUnits > 0 ? "text-red-soft" : ""}`}>{summary.refundedUnits}</p>
        </div>
        <div>
          <p className="text-[11px] text-ink-3">Buyers</p>
          <p className="text-sm font-semibold">{summary.uniqueBuyers}</p>
        </div>
      </div>
      {sales.length === 0 ? (
        <p className="text-xs text-ink-3">No sales yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft max-h-[32rem] overflow-y-auto">
          {sales.map((s) => {
            const buyerLabel = `${s.buyer.displayName} @${s.buyer.handle}`;
            return (
              <div key={s.id} className="py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm truncate">
                    {s.productTitle}
                    {s.quantity > 1 && <span className="text-ink-3"> ×{s.quantity}</span>}
                    {s.status === "REFUNDED" && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-red-soft">Refunded</span>}
                    {s.isGift && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-ink-3">Gift</span>}
                  </p>
                  {s.amountKobo != null && (
                    <p className={`text-sm font-semibold shrink-0 ${s.status === "REFUNDED" ? "text-red-soft line-through" : ""}`}>
                      {formatNaira(s.amountKobo)}
                    </p>
                  )}
                </div>
                <p className="text-[11px] text-ink-3">
                  Bought by{" "}
                  {onBuyerClick ? (
                    <button type="button" onClick={() => onBuyerClick(s.buyer.id)} className="font-semibold text-ink-2 hover:underline">
                      {buyerLabel}
                    </button>
                  ) : (
                    <Link href={`/u/${s.buyer.handle}`} className="font-semibold text-ink-2 hover:underline">
                      {buyerLabel}
                    </Link>
                  )}{" "}
                  · {new Date(s.createdAt).toLocaleString("en-NG")}
                </p>
                {s.plays !== null && s.status !== "REFUNDED" && (
                  <p className="text-[11px] text-ink-3">
                    {s.plays} play{s.plays === 1 ? "" : "s"}
                    {s.downloadedOfflineAt && <> · Saved offline {shortDate(s.downloadedOfflineAt)}</>}
                    {s.downloadedFileAt && <> · Downloaded file {shortDate(s.downloadedFileAt)}</>}
                    {!s.downloadedOfflineAt && !s.downloadedFileAt && <> · Not downloaded</>}
                  </p>
                )}
                {s.isGift && s.giftStatus && (
                  <p className="text-[11px] text-ink-3">
                    Gift{" "}
                    {s.giftStatus === "CLAIMED"
                      ? `claimed${s.giftClaimedByHandle ? ` by @${s.giftClaimedByHandle}` : ""}`
                      : s.giftStatus === "PENDING"
                        ? `unclaimed, expires ${s.giftExpiresAt ? new Date(s.giftExpiresAt).toLocaleString("en-NG") : "—"}`
                        : s.giftStatus.toLowerCase()}
                  </p>
                )}
                {s.refundReason && <p className="text-[11px] text-red-soft">{s.refundReason}</p>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
