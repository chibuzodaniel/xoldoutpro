"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { PlanPickerSheet } from "@/components/plans/PlanPickerSheet";
import { PUBLISH_OPTIONS } from "@/lib/publishOptions";

const PLAN_LABEL: Record<string, string> = { UNLIMITED: "Unlimited", BUYER_PAYS_FEE: "Buyer Pays Fee", LIMITED: "Limited" };

type Props = {
  // Called when an option is actually navigated to (not when the plan
  // gate intercepts the click) — PublishSheet.tsx uses this to close
  // itself, the plain /publish page passes nothing.
  onNavigate?: () => void;
};

// Shared by app/(app)/publish/page.tsx and components/nav/PublishSheet.tsx —
// same option list, same plan gate, so the two entry points (full page vs.
// nav sheet) can never drift out of sync on this. A plan is required before
// publishing at all (forced PlanPickerSheet if unset); even once one is
// set, "Plan: X · Switch" stays visible here so switching doesn't require a
// detour through Profile first (explicit ask).
export function PublishOptionsList({ onNavigate }: Props) {
  const { appUser } = useAuth();
  const [planSheetOpen, setPlanSheetOpen] = useState(false);
  const plan = appUser?.creatorPlan ?? null;

  function handleOptionClick(e: React.MouseEvent) {
    if (!plan) {
      e.preventDefault();
      setPlanSheetOpen(true);
      return;
    }
    onNavigate?.();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setPlanSheetOpen(true)}
        className="flex w-full items-center justify-between rounded-lg border border-line px-4 py-3 mb-4 text-left"
      >
        <span className="text-sm font-semibold">Plan: {plan ? PLAN_LABEL[plan] : "Not chosen"}</span>
        <span className="text-xs text-red-soft font-semibold">Switch</span>
      </button>

      <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
        {PUBLISH_OPTIONS.map((opt) =>
          opt.enabled ? (
            <Link key={opt.title} href={opt.href} onClick={handleOptionClick} className="flex items-center justify-between py-4">
              <div>
                <div className="text-sm font-semibold">{opt.title}</div>
                <div className="text-xs text-ink-3">{opt.subtitle}</div>
              </div>
              <span className="text-ink-3">›</span>
            </Link>
          ) : (
            <div key={opt.title} className="flex items-center justify-between py-4 opacity-40">
              <div>
                <div className="text-sm font-semibold">{opt.title}</div>
                <div className="text-xs text-ink-3">Coming soon</div>
              </div>
            </div>
          ),
        )}
      </div>

      <PlanPickerSheet open={planSheetOpen} onClose={() => setPlanSheetOpen(false)} />
    </>
  );
}
