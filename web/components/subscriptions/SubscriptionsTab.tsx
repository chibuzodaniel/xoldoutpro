"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { SubscribeSheet } from "@/components/subscriptions/SubscribeSheet";
import { durationLabel, subscriptionStatus } from "@/lib/subscriptions/plans";

type Sub = {
  id: string;
  creatorId: string;
  durationDays: number;
  priceKobo: number;
  currentPeriodEnd: string;
  autoRenew: boolean;
  savedCard: boolean;
  creator: {
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    isVerified: boolean;
    catalogSubscriptionOn: boolean;
    subscriptionPlans: { durationDays: number; priceKobo: number }[];
  };
};

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}
function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const BADGE = {
  active: { label: "Active", cls: "bg-red text-white" },
  ending: { label: "Ends soon", cls: "bg-white text-black" },
  expired: { label: "Expired", cls: "bg-surface-2 text-ink-2 border border-line" },
} as const;

// Library → Your Subscriptions (v2, design/v2-prototype). Loaded once when
// the tab opens; ?renew=<id> (from the renewal reminder) opens Renew.
export function SubscriptionsTab({ renewId }: { renewId?: string | null }) {
  const toast = useToast();
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [manage, setManage] = useState<Sub | null>(null);
  const [pay, setPay] = useState<{ sub: Sub; renewing: boolean } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const closeManage = useCallback(() => {
    setManage(null);
    setConfirmCancel(false);
  }, []);
  const closePay = useCallback(() => setPay(null), []);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/subscriptions")
      .then((res) => (res.ok ? res.json() : { subscriptions: [] }))
      .then((data) => {
        if (cancelled) return;
        const list: Sub[] = data.subscriptions ?? [];
        setSubs(list);
        const toRenew = renewId ? list.find((s) => s.id === renewId) : null;
        if (toRenew) setPay({ sub: toRenew, renewing: true });
      })
      .catch(() => !cancelled && setSubs([]));
    return () => {
      cancelled = true;
    };
  }, [renewId]);

  async function setAutoRenew(sub: Sub, autoRenew: boolean) {
    const res = await apiFetch(`/api/subscriptions/${sub.id}`, { method: "PATCH", body: JSON.stringify({ autoRenew }) }).catch(() => null);
    if (!res || !res.ok) return toast.error("Couldn't update your subscription");
    setSubs((cur) => cur?.map((s) => (s.id === sub.id ? { ...s, autoRenew } : s)) ?? cur);
    setManage((m) => (m && m.id === sub.id ? { ...m, autoRenew } : m));
    setConfirmCancel(false);
    toast.success(autoRenew ? "Auto-renew back on" : "Renewal cancelled");
  }

  if (subs === null) return <p className="py-10 text-center text-sm text-ink-3">Loading your subscriptions…</p>;

  if (subs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="font-serif text-2xl font-bold">No subscriptions yet</p>
        <p className="max-w-sm text-sm text-ink-3">Subscribe to an artist&apos;s catalog from their profile to stream all their songs in full.</p>
        <Link href="/discover" className="mt-2 rounded-full bg-red px-6 py-3 text-sm font-bold text-white">
          Find artists
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {subs.map((s) => {
          const status = subscriptionStatus(s);
          const badge = BADGE[status];
          return (
            <div key={s.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <Link href={`/u/${s.creator.handle}`} className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-red/50 to-black">
                  <FallbackImg src={s.creator.avatarUrl} alt={s.creator.displayName} className="h-full w-full object-cover" fallback={null} />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/u/${s.creator.handle}`} className="flex items-center gap-1.5 font-bold">
                    <span className="truncate">{s.creator.displayName}</span>
                    {s.creator.isVerified && <VerifiedBadge className="h-4 w-4 shrink-0" />}
                  </Link>
                  <p className="text-xs text-ink-3">
                    {durationLabel(s.durationDays)} · {naira(s.priceKobo)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${badge.cls}`}>{badge.label}</span>
              </div>
              <p className="mt-3 text-sm text-ink-2">
                {status === "expired" ? `Expired ${day(s.currentPeriodEnd)}` : s.autoRenew ? `Renews ${day(s.currentPeriodEnd)}` : `Ends ${day(s.currentPeriodEnd)}`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/u/${s.creator.handle}`} className="rounded-full bg-red px-4 py-2.5 text-[13px] font-bold text-white">
                  {status === "expired" ? "View catalog" : "Open catalog"}
                </Link>
                <button type="button" onClick={() => setManage(s)} className="rounded-full border border-line px-4 py-2.5 text-[13px] font-bold">
                  Manage
                </button>
                {status === "expired" && s.creator.catalogSubscriptionOn && s.creator.subscriptionPlans.length > 0 && (
                  <button type="button" onClick={() => setPay({ sub: s, renewing: false })} className="rounded-full bg-red px-4 py-2.5 text-[13px] font-bold text-white">
                    Resubscribe
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <BottomSheet open={Boolean(manage)} onClose={closeManage} title="Manage subscription">
        {manage && (
          <div className="flex flex-col gap-3 px-5 pb-2">
            <div className="rounded-2xl border border-line p-4 text-sm">
              <p className="font-bold">{manage.creator.displayName}</p>
              <p className="text-ink-3">
                {durationLabel(manage.durationDays)} · {naira(manage.priceKobo)}
                {subscriptionStatus(manage) === "expired"
                  ? ` · expired ${day(manage.currentPeriodEnd)}`
                  : manage.autoRenew
                    ? ` · renews automatically`
                    : ` · will not renew`}
              </p>
              {subscriptionStatus(manage) !== "expired" && (
                <p className="mt-1 text-ink-3">
                  {manage.autoRenew ? "Next renewal" : "Access until"} {day(manage.currentPeriodEnd)}
                </p>
              )}
              {manage.autoRenew && !manage.savedCard && subscriptionStatus(manage) !== "expired" && (
                <p className="mt-2 text-xs text-ink-3">We&apos;ll remind you a few days before, so you can renew in one tap.</p>
              )}
            </div>

            {subscriptionStatus(manage) !== "expired" &&
              (manage.autoRenew ? (
                confirmCancel ? (
                  <div className="flex flex-col gap-2 rounded-2xl border border-line p-4">
                    <p className="text-sm">
                      Cancel renewal? You keep access until {day(manage.currentPeriodEnd)}. You won&apos;t be charged again.
                    </p>
                    <button type="button" onClick={() => setAutoRenew(manage, false)} className="rounded-full border border-red px-4 py-3 text-[14px] font-bold text-red-soft">
                      Yes, cancel renewal
                    </button>
                    <button type="button" onClick={() => setConfirmCancel(false)} className="rounded-full bg-white px-4 py-3 text-[14px] font-bold text-black">
                      Keep subscription
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmCancel(true)} className="rounded-full border border-line px-4 py-3.5 text-[15px] font-bold">
                    Cancel renewal
                  </button>
                )
              ) : (
                <button type="button" onClick={() => setAutoRenew(manage, true)} className="rounded-full bg-white px-4 py-3.5 text-[15px] font-bold text-black">
                  Resume renewal
                </button>
              ))}

            {manage.creator.catalogSubscriptionOn && manage.creator.subscriptionPlans.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const sub = manage;
                  closeManage();
                  setPay({ sub, renewing: subscriptionStatus(sub) !== "expired" });
                }}
                className="rounded-full bg-red px-4 py-3.5 text-[15px] font-bold text-white"
              >
                {subscriptionStatus(manage) === "expired" ? "Resubscribe" : "Renew now"}
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {pay && (
        <SubscribeSheet
          open
          onClose={closePay}
          creator={{ id: pay.sub.creatorId, displayName: pay.sub.creator.displayName }}
          plans={pay.sub.creator.subscriptionPlans}
          defaultDays={pay.sub.durationDays}
          renewing={pay.renewing}
        />
      )}
    </>
  );
}
