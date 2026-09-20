"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { PlanPickerSheet } from "@/components/plans/PlanPickerSheet";

type PlanStatus = {
  plan: "UNLIMITED" | "BUYER_PAYS_FEE" | "LIMITED" | null;
  limitedSalesCount: number;
  buyerPaysFeeBonusSlots: number;
  liveProductCount: number;
  settings: { limitedPlanSalesCap: number; buyerPaysFeeUploadCap: number };
};

const DISMISS_KEY = "xoldout_plan_cap_nudge_dismissed";

// Same self-contained "check a milestone on mount, once-dismissible" shape
// as SalesMilestoneSheet — mounted on Profile (the app's hub page, reached
// every session) rather than polled separately. Dismiss key includes the
// exact trigger value so it re-surfaces if the underlying number grows
// further after being dismissed once (same idea as AndroidAppBanner's
// per-build dismiss), tracked client-side (localStorage) rather than a new
// server-side "seen" column, since this is a lower-stakes nudge than the
// verification milestone SalesMilestoneSheet guards.
export function PlanCapNudgeSheet() {
  const toast = useToast();
  const router = useRouter();
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [planSheetOpen, setPlanSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function check() {
      const res = await apiFetch("/api/me/plan");
      if (!res.ok) return;
      const data: PlanStatus = await res.json();
      setStatus(data);

      let dismissKey: string | null = null;
      if (data.plan === "LIMITED" && data.limitedSalesCount >= data.settings.limitedPlanSalesCap) {
        dismissKey = `limited-sales-${data.limitedSalesCount}`;
      } else if (
        data.plan === "BUYER_PAYS_FEE" &&
        data.liveProductCount >= data.settings.buyerPaysFeeUploadCap + data.buyerPaysFeeBonusSlots
      ) {
        dismissKey = `bpf-storage-${data.liveProductCount}`;
      }
      if (!dismissKey) return;

      try {
        if (localStorage.getItem(DISMISS_KEY) !== dismissKey) setOpen(true);
      } catch {
        setOpen(true);
      }
    }
    check();
  }, []);

  function dismiss(dismissKey: string) {
    setOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, dismissKey);
    } catch {
      // Best-effort only — worst case it re-shows next visit.
    }
  }

  async function buySlotPack() {
    setBusy(true);
    try {
      const res = await apiFetch("/api/me/plan/slot-pack", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not start checkout");
      }
      const data: { mode: "wallet" | "bachs"; checkoutUrl?: string } = await res.json();
      if (data.mode === "bachs" && data.checkoutUrl) {
        router.push(data.checkoutUrl);
        return;
      }
      toast.success("More upload slots added.");
      dismiss(`bpf-storage-${status?.liveProductCount ?? 0}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  const isLimitedCapped = status.plan === "LIMITED" && status.limitedSalesCount >= status.settings.limitedPlanSalesCap;
  const isStorageFull =
    status.plan === "BUYER_PAYS_FEE" &&
    status.liveProductCount >= status.settings.buyerPaysFeeUploadCap + status.buyerPaysFeeBonusSlots;

  return (
    <>
      <div
        className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${
          open ? "bg-black/60" : "pointer-events-none bg-black/0"
        }`}
        onClick={() => dismiss(isLimitedCapped ? `limited-sales-${status.limitedSalesCount}` : `bpf-storage-${status.liveProductCount}`)}
        aria-hidden={!open}
      >
        <div
          className={`relative w-full rounded-t-2xl border-t border-line-soft bg-surface px-4 pt-6 pb-8 transition-transform duration-300 ease-out ${
            open ? "translate-y-0" : "translate-y-full"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {isLimitedCapped ? (
            <>
              <h2 className="font-serif text-xl mb-2">You&apos;ve hit your Limited plan&apos;s sales cap</h2>
              <p className="text-sm text-ink-2 mb-6">
                You&apos;ve made {status.limitedSalesCount} sales on your Limited plan. Switch to Unlimited or Buyer Pays Fee, or renew
                Limited, to keep publishing.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => dismiss(`limited-sales-${status.limitedSalesCount}`)}
                  className="flex-1 rounded-lg border border-line px-4 py-3 text-sm font-semibold"
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlanSheetOpen(true);
                    dismiss(`limited-sales-${status.limitedSalesCount}`);
                  }}
                  className="flex-1 rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white"
                >
                  Switch or renew
                </button>
              </div>
            </>
          ) : isStorageFull ? (
            <>
              <h2 className="font-serif text-xl mb-2">You&apos;re out of upload storage</h2>
              <p className="text-sm text-ink-2 mb-6">
                You&apos;ve used all your Buyer Pays Fee upload slots. Buy more to keep publishing.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => dismiss(`bpf-storage-${status.liveProductCount}`)}
                  className="flex-1 rounded-lg border border-line px-4 py-3 text-sm font-semibold"
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={buySlotPack}
                  disabled={busy}
                  className="flex-1 rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "…" : "Buy more slots"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
      <PlanPickerSheet open={planSheetOpen} onClose={() => setPlanSheetOpen(false)} />
    </>
  );
}
