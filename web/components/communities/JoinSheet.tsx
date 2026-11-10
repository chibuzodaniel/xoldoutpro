"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useGatewayCheckout, GatewayPickerCancelled, ENABLED_GATEWAYS } from "@/lib/useGatewayCheckout";
import { GatewayPickerSheet } from "@/components/checkout/GatewayPickerSheet";
import { planPriceLabel } from "@/lib/communities/constants";

export type CommunityPlan = {
  id: string;
  name: string;
  description: string | null;
  priceKobo: number;
  cycle: string;
  benefits: string[];
  capacity: number | null;
  spotsLeft: number | null;
  requiresApproval: boolean;
};

const CAN_AUTO_CHARGE = ENABLED_GATEWAYS.includes("flutterwave");

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// Join a community (v2, design/v2-prototype): pick a plan, then join free,
// apply (approval plans), or pay. With no plans it's a plain join/request.
export function JoinSheet({
  open,
  onClose,
  community,
  plans,
  defaultPlanId,
  approvedPlanId,
  currentPlanId,
  inviteCode,
  onJoined,
}: {
  open: boolean;
  onClose: () => void;
  community: { id: string; name: string; isPrivate: boolean };
  plans: CommunityPlan[];
  defaultPlanId?: string | null;
  /** An application already approved for this plan — pay without re-applying. */
  approvedPlanId?: string | null;
  /** Renewing: the plan they're on (shown as such). */
  currentPlanId?: string | null;
  inviteCode?: string | null;
  onJoined: (status: "JOINED" | "PENDING") => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { appUser } = useAuth();
  const [picked, setPicked] = useState<string | null>(null);
  const [autoRenew, setAutoRenew] = useState(true);
  const [busy, setBusy] = useState(false);
  const { gatewaySheetOpen, pickGateway, handleGatewaySelect, closeGatewaySheet } = useGatewayCheckout();

  const usable = (p: CommunityPlan) => p.spotsLeft !== 0 || p.id === currentPlanId;
  const fallback = plans.find((p) => p.id === defaultPlanId && usable(p)) ?? plans.find(usable) ?? null;
  const selected = plans.find((p) => p.id === picked) ?? fallback;
  const needsApproval = Boolean(selected?.requiresApproval && selected.id !== approvedPlanId && selected.id !== currentPlanId);
  const recurringPaid = Boolean(selected && selected.priceKobo > 0 && selected.cycle !== "ONE_TIME");

  async function submit() {
    if (!appUser) return router.push("/login");
    setBusy(true);
    try {
      const paying = Boolean(selected && selected.priceKobo > 0 && !needsApproval);
      const gateway = paying ? await pickGateway() : undefined;
      const res = await apiFetch(`/api/communities/${community.id}/join`, {
        method: "POST",
        body: JSON.stringify({ planId: selected?.id, autoRenew, gateway, inviteCode: inviteCode ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not join");
      if (data.status === "CHECKOUT") return router.push(data.checkoutUrl);
      toast.success(data.status === "JOINED" ? `Welcome to ${community.name}` : "Application sent");
      onJoined(data.status);
      onClose();
    } catch (err) {
      if (err instanceof GatewayPickerCancelled) return;
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const label = !selected
    ? community.isPrivate && !inviteCode
      ? "Request to join"
      : "Join community"
    : needsApproval
      ? "Apply to join"
      : selected.priceKobo === 0
        ? "Join for free"
        : `${currentPlanId === selected.id ? "Renew" : "Continue"} · ${naira(selected.priceKobo)}`;

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title={`Join ${community.name}`}
        footer={
          <button type="button" onClick={submit} disabled={busy || (plans.length > 0 && !selected)} className="w-full rounded-full bg-red px-5 py-4 text-[16px] font-bold text-white disabled:opacity-50">
            {busy ? "Processing…" : label}
          </button>
        }
      >
        <div className="flex flex-col gap-3 px-5 pb-4">
          {plans.length === 0 ? (
            <p className="text-sm text-ink-3">
              {community.isPrivate && !inviteCode ? "This community is private — an admin approves new members." : "It's free to join."}
            </p>
          ) : (
            plans.map((p) => {
              const active = selected?.id === p.id;
              const full = !usable(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={full}
                  onClick={() => setPicked(p.id)}
                  aria-pressed={active}
                  className={`rounded-2xl border p-4 text-left disabled:opacity-50 ${active ? "border-red bg-red-tint" : "border-line bg-surface-2"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[17px] font-bold">{p.name}</span>
                    <span className="shrink-0 font-bold text-red-soft">{planPriceLabel(p)}</span>
                  </div>
                  {p.description && <p className="mt-1 text-[13px] text-ink-3">{p.description}</p>}
                  {p.benefits.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {p.benefits.map((b) => (
                        <li key={b} className="flex gap-2 text-[14px] text-ink-2">
                          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-red-soft" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                            <path d="M5 12l5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[12px] text-ink-3">
                    {full
                      ? "This plan is full."
                      : [
                          p.spotsLeft != null ? `${p.spotsLeft} spots left` : null,
                          p.requiresApproval ? "Approval required" : "Instant access",
                          p.priceKobo > 0 && p.cycle !== "ONE_TIME" ? "auto-renew optional" : null,
                          p.id === currentPlanId ? "your plan" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </p>
                </button>
              );
            })
          )}

          {recurringPaid && !needsApproval && (
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
              <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${autoRenew ? "bg-red" : "border border-line bg-surface-2"}`}>
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${autoRenew ? "translate-x-6" : "translate-x-1"}`} />
              </span>
            </button>
          )}
          {needsApproval && selected && (
            <p className="text-[13px] text-ink-3">
              An admin reviews your application first.{selected.priceKobo > 0 ? " Once approved, you'll be asked to pay." : ""}
            </p>
          )}
        </div>
      </BottomSheet>
      <GatewayPickerSheet open={gatewaySheetOpen} onSelect={handleGatewaySelect} onClose={closeGatewaySheet} />
    </>
  );
}
