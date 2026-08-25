"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

// One-time nudge (lib/verification/eligibility.ts's checkSalesMilestone) for
// a seller who's crossed 50 valid sales but hasn't applied for SELLER
// verification yet. Checked on Profile mount — the app's hub page, so it's
// reached on effectively every session without needing its own polling.
// Same bottom-sheet shape as ReportSheet; "Not now" and "Apply now" both
// mark it seen so it never re-triggers.
export function SalesMilestoneSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    async function check() {
      const res = await apiFetch("/api/verification/sales-milestone");
      if (!res.ok) return;
      const data: { shouldNotify: boolean } = await res.json();
      if (data.shouldNotify) setOpen(true);
    }
    check();
  }, []);

  async function dismiss(navigate: boolean) {
    setOpen(false);
    apiFetch("/api/verification/sales-milestone", { method: "POST" }).catch(() => {});
    if (navigate) router.push("/verification");
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${
        open ? "bg-black/60" : "pointer-events-none bg-black/0"
      }`}
      onClick={() => dismiss(false)}
      aria-hidden={!open}
    >
      <div
        className={`relative w-full rounded-t-2xl border-t border-line-soft bg-surface px-4 pt-6 pb-8 transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-serif text-xl mb-2">You&apos;ve hit 50 sales 🎉</h2>
        <p className="text-sm text-ink-2 mb-6">
          You&apos;ve made over 50 sales on XOLDOUT. Apply for a Verified Seller badge to build more trust with buyers.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => dismiss(false)}
            className="flex-1 rounded-lg border border-line px-4 py-3 text-sm font-semibold"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => dismiss(true)}
            className="flex-1 rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white"
          >
            Apply now
          </button>
        </div>
      </div>
    </div>
  );
}
