"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { FallbackImg } from "@/components/ui/FallbackImg";

type GiftProduct = {
  id: string;
  title: string;
  type: "RELEASE" | "BEAT" | "EVENT";
  release: { artworkLadder: unknown } | null;
  beat: { coverImageLadder: unknown } | null;
};

type SentGift = {
  id: string;
  status: "PENDING" | "CLAIMED" | "EXPIRED" | "REFUNDED";
  claimToken: string;
  expiresAt: string;
  product: GiftProduct;
  claimedBy: { handle: string; displayName: string } | null;
};

type ReceivedGift = {
  id: string;
  claimedAt: string | null;
  product: GiftProduct;
  giver: { handle: string; displayName: string };
};

function artUrl(product: GiftProduct) {
  const ladder = (product.release?.artworkLadder ?? product.beat?.coverImageLadder) as Record<string, string> | undefined;
  return ladder?.["256"] ?? null;
}

const STATUS_LABEL: Record<SentGift["status"], string> = {
  PENDING: "Waiting to be claimed",
  CLAIMED: "Claimed",
  EXPIRED: "Expired, refunded",
  REFUNDED: "Expired, refunded",
};

// Cards, not rows — each gift is a small tile with its own artwork, matching
// the rest of Library.
function GiftCard({ children, product }: { children: React.ReactNode; product: GiftProduct }) {
  const art = artUrl(product);
  return (
    <div className="rounded-lg border border-line-soft p-2.5 flex gap-3">
      <div className="h-14 w-14 rounded bg-surface-2 overflow-hidden shrink-0">
        <FallbackImg src={art} alt={product.title} className="h-full w-full object-cover" fallback={null} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold line-clamp-1">{product.title}</p>
        {children}
      </div>
    </div>
  );
}

function SentGiftCard({ gift }: { gift: SentGift }) {
  const [copied, setCopied] = useState(false);
  const claimUrl = typeof window !== "undefined" ? `${window.location.origin}/gifts/claim/${gift.claimToken}` : "";

  function copyLink() {
    navigator.clipboard?.writeText(claimUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <GiftCard product={gift.product}>
      <p className="text-xs text-ink-3 mb-1">
        {gift.status === "CLAIMED" && gift.claimedBy ? `Claimed by ${gift.claimedBy.displayName}` : STATUS_LABEL[gift.status]}
      </p>
      {gift.status === "PENDING" && (
        <button type="button" onClick={copyLink} className="text-[12px] font-semibold text-red-soft">
          {copied ? "Link copied" : "Copy claim link"}
        </button>
      )}
    </GiftCard>
  );
}

function ReceivedGiftCard({ gift }: { gift: ReceivedGift }) {
  return (
    <Link href={`/r/${gift.product.id}`} className="block">
      <GiftCard product={gift.product}>
        <p className="text-xs text-ink-3">from {gift.giver.displayName}</p>
      </GiftCard>
    </Link>
  );
}

export function GiftsTab() {
  const [data, setData] = useState<{ sent: SentGift[]; received: ReceivedGift[] } | null>(null);

  useEffect(() => {
    apiFetch("/api/gifts")
      .then((res) => (res.ok ? res.json() : { sent: [], received: [] }))
      .then(setData);
  }, []);

  if (data === null) return <LoadingSpinner full size="md" />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-2">Sent</h2>
        {data.sent.length === 0 ? (
          <p className="text-sm text-ink-3">Gift a release, beat, or ticket from its page — nothing sent yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.sent.map((g) => (
              <SentGiftCard key={g.id} gift={g} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-2">Received</h2>
        {data.received.length === 0 ? (
          <p className="text-sm text-ink-3">Nothing claimed yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.received.map((g) => (
              <ReceivedGiftCard key={g.id} gift={g} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
