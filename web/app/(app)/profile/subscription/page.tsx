"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { BackHeader } from "@/components/ui/BackHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/ToastProvider";
import { MIN_SUBSCRIPTION_PRICE_KOBO, SUBSCRIPTION_DURATIONS } from "@/lib/subscriptions/plans";

type Row = { enabled: boolean; naira: string };

// Catalog subscription settings (v2, design/v2-prototype): the artist turns
// it on and sets a price for each duration they want to offer.
export default function SubscriptionSettingsPage() {
  const toast = useToast();
  const { appUser } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [on, setOn] = useState(false);
  const [rows, setRows] = useState<Record<number, Row>>(() =>
    Object.fromEntries(SUBSCRIPTION_DURATIONS.map((d) => [d.days, { enabled: d.days === 30, naira: "" }])),
  );
  const [subscribers, setSubscribers] = useState(0);
  const [saving, setSaving] = useState(false);

  function apply(data: { on: boolean; plans: { durationDays: number; priceKobo: number }[]; activeSubscribers: number }) {
    setOn(data.on);
    setSubscribers(data.activeSubscribers);
    if (data.plans.length > 0) {
      setRows(
        Object.fromEntries(
          SUBSCRIPTION_DURATIONS.map((d) => {
            const plan = data.plans.find((p) => p.durationDays === d.days);
            return [d.days, { enabled: Boolean(plan), naira: plan ? String(plan.priceKobo / 100) : "" }];
          }),
        ),
      );
    }
  }

  useEffect(() => {
    if (!appUser) return;
    apiFetch("/api/me/subscription-plans")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) apply(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [appUser]);

  async function save() {
    const plans = SUBSCRIPTION_DURATIONS.filter((d) => rows[d.days].enabled).map((d) => ({
      durationDays: d.days,
      priceKobo: Math.round(parseFloat(rows[d.days].naira || "0") * 100),
    }));
    if (on && plans.length === 0) return toast.error("Add at least one duration with a price");
    if (plans.some((p) => !Number.isFinite(p.priceKobo) || p.priceKobo < MIN_SUBSCRIPTION_PRICE_KOBO)) {
      return toast.error("Paid plans need at least ₦100");
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/me/subscription-plans", { method: "PUT", body: JSON.stringify({ on, plans }) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Couldn't save your plans");
      apply(data);
      toast.success(on ? "Plans saved" : "Subscription turned off");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save your plans");
    } finally {
      setSaving(false);
    }
  }

  if (!appUser || !loaded) return <LoadingSpinner full size="lg" />;

  return (
    <div className="pb-24">
      <BackHeader title="Catalog subscription" />
      <div className="mx-auto flex max-w-xl flex-col gap-5 px-4">
        <p className="text-sm text-ink-3">
          Fans pay you on a schedule to stream every song you&apos;ve released in full while they&apos;re subscribed. They can&apos;t
          download — buying a song still does that. Fans who already paid keep their time if you change prices or turn this off.
        </p>

        <div className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4">
          <span>
            <span className="block font-semibold">Active subscribers</span>
            <span className="block text-xs text-ink-3">Paying for your catalog right now</span>
          </span>
          <span className="font-serif text-3xl font-bold">{subscribers.toLocaleString("en-NG")}</span>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => setOn((v) => !v)}
          className="flex items-center justify-between gap-4 rounded-2xl border border-line p-4 text-left"
        >
          <span>
            <span className="block text-[15px] font-semibold">Offer a catalog subscription</span>
            <span className="block text-[12px] text-ink-3">Shows a Subscribe button on your profile.</span>
          </span>
          <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-red" : "border border-line bg-surface-2"}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
          </span>
        </button>

        <div className="flex flex-col gap-2.5">
          <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3">Durations and prices</h2>
          {SUBSCRIPTION_DURATIONS.map((d) => {
            const row = rows[d.days];
            return (
              <div key={d.days} className={`flex items-center gap-3 rounded-2xl border p-3.5 ${row.enabled ? "border-line-strong bg-surface" : "border-line-soft"}`}>
                <label className="flex flex-1 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => setRows({ ...rows, [d.days]: { ...row, enabled: e.target.checked } })}
                    className="h-5 w-5 accent-red"
                  />
                  <span>
                    <span className="block font-semibold">{d.label}</span>
                    <span className="block text-xs text-ink-3">Billed every {d.days} days</span>
                  </span>
                </label>
                <div className="flex items-center rounded-xl border border-line bg-bg px-3">
                  <span className="text-sm text-ink-3">₦</span>
                  <input
                    inputMode="numeric"
                    aria-label={`${d.label} price`}
                    placeholder="0"
                    disabled={!row.enabled}
                    value={row.naira}
                    onChange={(e) => setRows({ ...rows, [d.days]: { ...row, naira: e.target.value.replace(/[^\d.]/g, "") } })}
                    className="w-24 bg-transparent px-1.5 py-2.5 text-right text-sm outline-none disabled:opacity-40"
                  />
                </div>
              </div>
            );
          })}
          <p className="text-xs text-ink-3">Each paid plan needs at least ₦100.</p>
        </div>

        <button type="button" onClick={save} disabled={saving} className="w-full rounded-full bg-red px-5 py-4 text-[16px] font-bold text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save plans"}
        </button>
        <Link href={`/u/${appUser.handle}`} className="text-center text-sm font-semibold text-ink-2">
          See it on your profile
        </Link>
      </div>
    </div>
  );
}
