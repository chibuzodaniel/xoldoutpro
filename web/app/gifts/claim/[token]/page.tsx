"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type GiftPreview = {
  status: "PENDING" | "CLAIMED" | "EXPIRED" | "REFUNDED";
  expiresAt: string;
  giver: { displayName: string; handle: string };
  product: {
    id: string;
    title: string;
    type: "RELEASE" | "BEAT" | "EVENT";
    release: { artworkLadder: unknown } | null;
    beat: { coverImageLadder: unknown } | null;
  };
};

function artUrl(product: GiftPreview["product"]) {
  const ladder = (product.release?.artworkLadder ?? product.beat?.coverImageLadder) as Record<string, string> | undefined;
  return ladder?.["1024"] ?? null;
}

export default function ClaimGiftPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();

  const [gift, setGift] = useState<GiftPreview | null | "not_found">(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/gifts/claim/${token}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setGift(data ?? "not_found"));
  }, [token]);

  async function handleClaim() {
    if (!firebaseUser) {
      router.push(`/login?next=/gifts/claim/${token}`);
      return;
    }
    setClaiming(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/gifts/claim/${token}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not claim this gift");
      router.push(`/r/${data.productId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setClaiming(false);
    }
  }

  if (gift === null || authLoading) return <LoadingSpinner full size="lg" />;

  if (gift === "not_found") {
    return (
      <main className="flex flex-1 flex-col items-center px-6 py-16">
        <p className="text-sm text-ink-3">This gift link isn&apos;t valid.</p>
      </main>
    );
  }

  const art = artUrl(gift.product);
  const isExpired = gift.status === "EXPIRED" || gift.status === "REFUNDED" || new Date(gift.expiresAt) < new Date();
  const alreadyClaimed = gift.status === "CLAIMED";

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <p className="text-[11px] tracking-[0.22em] uppercase text-red font-semibold mb-4">You&apos;ve got a gift</p>

        <div className="h-40 w-40 rounded-lg bg-surface-2 overflow-hidden mx-auto mb-5">
          {art && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={art} alt={gift.product.title} className="h-full w-full object-cover" />
          )}
        </div>

        <h1 className="font-serif text-2xl mb-2">{gift.product.title}</h1>
        <p className="text-sm text-ink-3 mb-8">from {gift.giver.displayName}</p>

        {error && <p className="text-sm text-red-soft mb-4">{error}</p>}

        {alreadyClaimed ? (
          <p className="text-sm text-ink-3">This gift has already been claimed.</p>
        ) : isExpired ? (
          <p className="text-sm text-ink-3">This gift link has expired.</p>
        ) : (
          <button
            type="button"
            onClick={handleClaim}
            disabled={claiming}
            className="w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {claiming ? "Claiming…" : firebaseUser ? "Claim it" : "Log in to claim"}
          </button>
        )}
      </div>
    </main>
  );
}
