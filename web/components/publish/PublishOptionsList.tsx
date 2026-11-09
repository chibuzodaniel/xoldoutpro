"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { PlanPickerSheet } from "@/components/plans/PlanPickerSheet";
import { PUBLISH_OPTIONS } from "@/lib/publishOptions";

const PLAN_LABEL: Record<string, string> = { UNLIMITED: "Unlimited", BUYER_PAYS_FEE: "Buyer Pays Fee", LIMITED: "Limited" };

// v2 Drop cards (design/v2-prototype): one red icon per option.
const ICONS: Record<string, React.ReactNode> = {
  "/publish/music": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden>
      <path d="M9 18V5l11-2v13" strokeLinejoin="round" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  ),
  "/publish/beat": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden>
      <path d="M4 6h9M4 11h9M4 16h5" strokeLinecap="round" />
      <circle cx="18" cy="15.5" r="2.6" />
      <path d="M20.6 15.5V7" strokeLinecap="round" />
    </svg>
  ),
  "/publish/event": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  ),
  "/publish/merch": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden>
      <path d="M5 8h14l-1 12H6L5 8z" strokeLinejoin="round" />
      <path d="M9 8V6a3 3 0 016 0v2" strokeLinecap="round" />
    </svg>
  ),
};

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
        className="flex w-full items-center justify-between rounded-2xl border border-line px-4 py-3 mb-4 text-left"
      >
        <span className="text-sm font-semibold">Plan: {plan ? PLAN_LABEL[plan] : "Not chosen"}</span>
        <span className="text-xs text-red-soft font-semibold">Switch</span>
      </button>

      <div className="flex flex-col gap-3">
        {PUBLISH_OPTIONS.map((opt) =>
          opt.enabled ? (
            <Link key={opt.title} href={opt.href} onClick={handleOptionClick} className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-4">
              <span className="mt-0.5 text-red-soft">{ICONS[opt.href]}</span>
              <span>
                <span className="block text-[17px] font-bold">{opt.title}</span>
                <span className="mt-1 block text-[14px] leading-snug text-ink-3">{opt.subtitle}</span>
              </span>
            </Link>
          ) : (
            <div key={opt.title} className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-4 opacity-40">
              <span className="mt-0.5 text-red-soft">{ICONS[opt.href]}</span>
              <span>
                <span className="block text-[17px] font-bold">{opt.title}</span>
                <span className="mt-1 block text-[14px] text-ink-3">Coming soon</span>
              </span>
            </div>
          ),
        )}
      </div>

      <PlanPickerSheet open={planSheetOpen} onClose={() => setPlanSheetOpen(false)} />
    </>
  );
}
