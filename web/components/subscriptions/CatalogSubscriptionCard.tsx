"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { SubscribeSheet, type PlanOption } from "@/components/subscriptions/SubscribeSheet";

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// "Catalog subscription" on an artist's profile (design/v2-prototype):
// From ₦X. Unlock <name>'s music catalog. [Subscribe]. The viewer's own
// subscription is looked up once, only when signed in.
export function CatalogSubscriptionCard({ creator, plans }: { creator: { id: string; displayName: string }; plans: PlanOption[] }) {
  const { appUser } = useAuth();
  const isOwner = appUser?.id === creator.id;
  const [activeUntil, setActiveUntil] = useState<Date | null>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!appUser || isOwner) return;
    let cancelled = false;
    apiFetch(`/api/subscriptions?creatorId=${encodeURIComponent(creator.id)}`)
      .then((res) => (res.ok ? res.json() : { subscriptions: [] }))
      .then((data) => {
        const end = data.subscriptions?.[0]?.currentPeriodEnd;
        if (!cancelled && end && new Date(end).getTime() > Date.now()) setActiveUntil(new Date(end));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [appUser, isOwner, creator.id]);

  if (plans.length === 0) return null;
  const from = Math.min(...plans.map((p) => p.priceKobo));

  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl border border-red bg-red-tint p-3">
      <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-red-soft" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M9 18V5l12-2v13" strokeLinejoin="round" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
      <div className="min-w-0 flex-1 text-left">
        <p className="font-semibold">Catalog subscription</p>
        <p className="text-xs text-ink-2">
          {activeUntil
            ? `Subscribed until ${activeUntil.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}`
            : `From ${naira(from)}. Unlock ${creator.displayName}'s music catalog.`}
        </p>
      </div>
      {isOwner ? (
        <Link href="/profile/subscription" className="shrink-0 rounded-full border border-line px-4 py-2.5 text-[14px] font-bold">
          Manage
        </Link>
      ) : activeUntil ? (
        <Link href="/library?tab=subscriptions" className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-4 py-2.5 text-[14px] font-bold">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
            <path d="M5 12l5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Subscribed
        </Link>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-full bg-red px-5 py-2.5 text-[14px] font-bold text-white">
          Subscribe
        </button>
      )}
      <SubscribeSheet open={open} onClose={close} creator={creator} plans={plans} />
    </div>
  );
}
