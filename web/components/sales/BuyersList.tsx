"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageButton } from "@/components/messages/MessageButton";

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

export type BuyerBreakdown = {
  buyer: { id: string; handle: string; displayName: string; avatarUrl: string | null };
  paidUnits: number;
  refundedUnits: number;
  spentKobo?: number; // moderator view only
  firstAt: string;
  lastAt: string;
  products: {
    productId: string;
    title: string;
    type: string;
    units: number;
    refunded: number;
    gift: boolean;
    plays: number | null;
    downloadedOfflineAt: string | null;
    downloadedFileAt: string | null;
  }[];
};

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });

// Who bought a seller's products, refunds included (explicit ask,
// 2026-10-15) — rendered by both the seller's own Analytics page and the
// moderator user detail view (UsersListPanel), from the same
// lib/commerce/sellerSales.ts data. onBuyerClick lets the moderator view
// open the buyer's own detail page; without it the buyer links to their
// public profile and gets a Message button (the seller's own view).
export function BuyersList({
  summary,
  sales,
  buyers,
  onBuyerClick,
}: {
  summary: BuyersSummary;
  sales: BuyerSale[];
  buyers: BuyerBreakdown[];
  onBuyerClick?: (buyerId: string) => void;
}) {
  const [view, setView] = useState<"buyers" | "sales">("buyers");
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
      {sales.length > 0 && (
        <div className="flex gap-1.5 mb-2">
          {(["buyers", "sales"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-full px-3 py-1 text-xs font-semibold border ${view === v ? "border-ink text-ink" : "border-line text-ink-3"}`}
            >
              {v === "buyers" ? `By buyer (${buyers.length})` : `All sales (${sales.length})`}
            </button>
          ))}
        </div>
      )}
      {sales.length === 0 ? (
        <p className="text-xs text-ink-3">No sales yet.</p>
      ) : view === "buyers" ? (
        <div className="flex flex-col divide-y divide-line-soft max-h-[40rem] overflow-y-auto">
          {buyers.map((b) => (
            <div key={b.buyer.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {b.buyer.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small avatar, same as other user rows
                    <img src={b.buyer.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-surface border border-line shrink-0" />
                  )}
                  <div className="min-w-0">
                    {onBuyerClick ? (
                      <button type="button" onClick={() => onBuyerClick(b.buyer.id)} className="text-sm font-semibold truncate hover:underline text-left">
                        {b.buyer.displayName} <span className="font-normal text-ink-3">@{b.buyer.handle}</span>
                      </button>
                    ) : (
                      <Link href={`/u/${b.buyer.handle}`} className="text-sm font-semibold truncate hover:underline block">
                        {b.buyer.displayName} <span className="font-normal text-ink-3">@{b.buyer.handle}</span>
                      </Link>
                    )}
                    <p className="text-[11px] text-ink-3">
                      {b.paidUnits} bought
                      {b.refundedUnits > 0 && <span className="text-red-soft"> · {b.refundedUnits} refunded</span>}
                      {b.spentKobo != null && <> · {formatNaira(b.spentKobo)} spent</>} · last {shortDate(b.lastAt)}
                    </p>
                  </div>
                </div>
                {!onBuyerClick && <MessageButton targetUserId={b.buyer.id} />}
              </div>
              <div className="mt-1.5 ml-[2.625rem] flex flex-col gap-0.5">
                {b.products.map((p) => (
                  <p key={p.productId} className="text-[11px] text-ink-3">
                    <span className="text-ink-2">{p.title}</span>
                    {p.units > 1 && <> ×{p.units}</>}
                    {p.gift && <> · gift</>}
                    {p.refunded > 0 && <span className="text-red-soft"> · {p.refunded} refunded</span>}
                    {p.plays !== null && p.units > 0 && (
                      <>
                        {" "}· {p.plays} play{p.plays === 1 ? "" : "s"}
                        {p.downloadedOfflineAt && <> · Saved offline</>}
                        {p.downloadedFileAt && <> · Downloaded file</>}
                        {!p.downloadedOfflineAt && !p.downloadedFileAt && <> · Not downloaded</>}
                      </>
                    )}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
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
