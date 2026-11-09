"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useGatewayCheckout, GatewayPickerCancelled, ENABLED_GATEWAYS } from "@/lib/useGatewayCheckout";
import { GatewayPickerSheet } from "@/components/checkout/GatewayPickerSheet";
import { durationLabel, monthlyEquivalentKobo } from "@/lib/subscriptions/plans";

// Only Flutterwave can re-charge a saved Naira card; with Bachs alone,
// auto-renew means a reminder with a one-tap renew (lib/subscriptions/renewals.ts).
const CAN_AUTO_CHARGE = ENABLED_GATEWAYS.includes("flutterwave");

export type PlanOption = { durationDays: number; priceKobo: number };

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// Catalog subscription checkout (v2, design/v2-prototype): pick a duration,
// choose auto-renew, pay. Also used to renew early or resubscribe.
export function SubscribeSheet({
  open,
  onClose,
  creator,
  plans,
  defaultDays,
  renewing = false,
}: {
  open: boolean;
  onClose: () => void;
  creator: { id: string; displayName: string };
  plans: PlanOption[];
  defaultDays?: number;
  renewing?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { appUser } = useAuth();
  const [days, setDays] = useState<number | null>(null);
  const [autoRenew, setAutoRenew] = useState(true);
  const [busy, setBusy] = useState(false);
  const { gatewaySheetOpen, pickGateway, handleGatewaySelect, closeGatewaySheet } = useGatewayCheckout();

  const selectedDays = days ?? (plans.some((p) => p.durationDays === defaultDays) ? defaultDays! : plans[0]?.durationDays);
  const selected = plans.find((p) => p.durationDays === selectedDays) ?? null;

  async function pay() {
    if (!appUser) return router.push("/login");
    if (!selected) return;
    setBusy(true);
    try {
      const gateway = await pickGateway();
      const res = await apiFetch("/api/subscriptions/checkout", {
        method: "POST",
        body: JSON.stringify({ creatorId: creator.id, durationDays: selected.durationDays, autoRenew, gateway }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not start checkout");
      router.push(data.checkoutUrl);
    } catch (err) {
      if (err instanceof GatewayPickerCancelled) return;
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={renewing ? "Renew subscription" : "Catalog subscription"}>
        <div className="flex flex-col gap-4 px-5 pb-2">
          <p className="text-sm text-ink-3">
            Stream every song by <span className="font-semibold text-ink">{creator.displayName}</span> in full while your subscription is active.
            Downloads still need a purchase.
          </p>

          {plans.length === 0 ? (
            <p className="rounded-2xl border border-line p-4 text-center text-sm text-ink-3">This artist isn&apos;t offering a subscription right now.</p>
          ) : (
            <div role="radiogroup" aria-label="Plan" className="flex flex-col gap-2.5">
              {plans.map((p) => {
                const active = p.durationDays === selectedDays;
                return (
                  <button
                    key={p.durationDays}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setDays(p.durationDays)}
                    className={`flex items-center gap-3 rounded-2xl border p-4 text-left ${active ? "border-red bg-red-tint" : "border-line bg-surface-2"}`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${active ? "border-red" : "border-line-strong"}`}>
                      {active && <span className="h-2.5 w-2.5 rounded-full bg-red" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-bold">{durationLabel(p.durationDays)}</span>
                      <span className="block text-[12px] text-ink-3">
                        Billed every {p.durationDays} days
                        {p.durationDays > 30 ? ` · about ${naira(monthlyEquivalentKobo(p.priceKobo, p.durationDays))}/month` : ""}
                      </span>
                    </span>
                    <span className="font-serif text-[20px] font-bold text-red-soft">{naira(p.priceKobo)}</span>
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            role="switch"
            aria-checked={autoRenew}
            onClick={() => setAutoRenew((v) => !v)}
            className="flex items-center justify-between gap-4 rounded-2xl border border-line p-4 text-left"
          >
            <span>
              <span className="block text-[15px] font-semibold">Auto-renew</span>
              <span className="block text-[12px] text-ink-3">
                {autoRenew
                  ? CAN_AUTO_CHARGE
                    ? "We'll charge your card again before it ends. Turn it off any time."
                    : "We'll remind you before it ends so you can renew in one tap."
                  : "You won't be charged again. It just ends."}
              </span>
            </span>
            <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${autoRenew ? "bg-red" : "bg-surface-2 border border-line"}`}>
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${autoRenew ? "translate-x-6" : "translate-x-1"}`} />
            </span>
          </button>

          <button
            type="button"
            onClick={pay}
            disabled={busy || !selected}
            className="w-full rounded-full bg-red px-5 py-4 text-[16px] font-bold text-white disabled:opacity-50"
          >
            {busy ? "Processing payment…" : selected ? `${renewing ? "Renew" : "Subscribe"} · ${naira(selected.priceKobo)}` : "Subscribe"}
          </button>
        </div>
      </BottomSheet>
      <GatewayPickerSheet open={gatewaySheetOpen} onSelect={handleGatewaySelect} onClose={closeGatewaySheet} />
    </>
  );
}
