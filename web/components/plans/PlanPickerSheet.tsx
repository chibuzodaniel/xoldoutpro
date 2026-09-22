"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";

type Plan = "UNLIMITED" | "BUYER_PAYS_FEE" | "LIMITED";

type Props = {
  open: boolean;
  onClose: () => void;
  // Called once the switch actually lands (wallet-paid LIMITED or an
  // instant UNLIMITED/BUYER_PAYS_FEE switch) — not called for the Bachs
  // redirect case, since the plan hasn't changed yet when that happens.
  onChanged?: (plan: Plan) => void;
};

const OPTIONS: { value: Plan; label: string; description: string }[] = [
  {
    value: "UNLIMITED",
    label: "Unlimited",
    description: "No upfront plan fee. XOLDOUT takes 12% per sale (music/beats/merch), you keep 88%. Unlimited uploads, unlimited sales.",
  },
  {
    value: "BUYER_PAYS_FEE",
    label: "Buyer Pays Fee",
    description: "You keep 100% of your price — the buyer pays a service charge on top at checkout. Upload storage is capped; buy more room as you grow.",
  },
  {
    value: "LIMITED",
    label: "Limited",
    description: "Pay a flat fee to unlock 100 uploads and keep 100% of unlimited sales. Renew (same fee) once you hit your upload limit.",
  },
];

// Controlled sheet, same shape as GatewayPickerSheet — parent owns `open`,
// this only reports selections back. Reused from the publish-flow gate
// (forced first choice, or "Plan: X · Switch" even when already set) and
// from the profile "Creator plan" row.
export function PlanPickerSheet({ open, onClose, onChanged }: Props) {
  const { refreshAppUser } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<Plan | null>(null);

  async function choose(plan: Plan) {
    setBusy(plan);
    try {
      const res = await apiFetch("/api/me/plan", { method: "POST", body: JSON.stringify({ plan }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not update your plan");
      }
      const data: { mode: "instant" | "wallet" | "bachs"; checkoutUrl?: string } = await res.json();
      if (data.mode === "bachs" && data.checkoutUrl) {
        router.push(data.checkoutUrl);
        return;
      }
      await refreshAppUser();
      toast.success(plan === "LIMITED" ? "Limited plan activated." : `Switched to ${OPTIONS.find((o) => o.value === plan)?.label}.`);
      onChanged?.(plan);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${
        open ? "bg-black/60" : "pointer-events-none bg-black/0"
      }`}
      onClick={onClose}
      aria-hidden={!open}
    >
      <div
        className={`relative w-full rounded-t-2xl border-t border-line-soft bg-surface px-4 pt-6 pb-8 transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-serif text-xl mb-1">Choose your creator plan</h2>
        <p className="text-sm text-ink-3 mb-5">You can switch plans any time.</p>
        <div className="flex flex-col gap-2">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={busy !== null}
              onClick={() => choose(opt.value)}
              className="flex items-center justify-between gap-3 rounded-lg border border-line px-4 py-3.5 text-left transition-colors duration-150 hover:border-line-strong disabled:opacity-60"
            >
              <div>
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-xs text-ink-3">{opt.description}</p>
              </div>
              <span className="text-ink-3 shrink-0">{busy === opt.value ? "…" : "›"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
