"use client";

import { useEffect, useState } from "react";
import { BackHeader } from "@/components/ui/BackHeader";
import { ShareButton } from "@/components/ui/ShareButton";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type Application = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
};

type MeResponse = {
  isAmbassador: boolean;
  application: Application | null;
  ambassadorCode?: string;
  referredCount?: number;
  activeInviteCount?: number;
  revenueGeneratedKobo?: number;
  tier?: "SILVER" | "GOLD";
  firstPurchasePercent?: number;
  continuousPercent?: number;
  nextTier?: { name: string; remainingActiveInvites: number; firstPurchasePercent: number; continuousPercent: number } | null;
};

const TIER_LABEL: Record<string, string> = { SILVER: "Silver", GOLD: "Gold" };
const TIER_COLOR: Record<string, string> = {
  SILVER: "bg-zinc-400/20 text-zinc-400",
  GOLD: "bg-yellow-500/20 text-yellow-600",
};

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export default function AmbassadorPage() {
  const toast = useToast();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [pitch, setPitch] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [savingCode, setSavingCode] = useState(false);

  async function load() {
    const res = await apiFetch("/api/ambassador/me");
    if (!res.ok) return;
    setMe(await res.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
  }, []);

  async function handleApply() {
    setBusy(true);
    try {
      const res = await apiFetch("/api/ambassador/apply", { method: "POST", body: JSON.stringify({ pitch }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not submit application");
      toast.success("Application submitted — we'll review it soon.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveCode() {
    const trimmed = codeInput.trim().toLowerCase();
    if (!trimmed) return;
    setSavingCode(true);
    try {
      const res = await apiFetch("/api/ambassador/me", { method: "PATCH", body: JSON.stringify({ ambassadorCode: trimmed }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update your code");
      toast.success("Referral code updated.");
      setEditingCode(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingCode(false);
    }
  }

  if (!me) {
    return (
      <div className="pb-10">
        <BackHeader title="Ambassador" />
        <div className="flex justify-center py-10">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (me.isAmbassador) {
    const referralPath = `/signup?ref=${me.ambassadorCode}`;
    return (
      <div className="pb-10 px-4">
        <BackHeader title="Ambassador" />

        <div className="flex items-center gap-2 mb-4">
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${TIER_COLOR[me.tier ?? "SILVER"]}`}>
            {TIER_LABEL[me.tier ?? "SILVER"]}
          </span>
        </div>

        <p className="text-xs text-ink-3 mb-1">
          {me.firstPurchasePercent}% of the sale (capped at our own commission) on a referral&apos;s first purchase,{" "}
          {me.continuousPercent}% on every purchase after that.
        </p>

        {me.nextTier && (
          <p className="text-xs text-ink-3 mb-6">
            {me.nextTier.remainingActiveInvites} more active invite{me.nextTier.remainingActiveInvites === 1 ? "" : "s"} to reach{" "}
            <span className="font-semibold">{TIER_LABEL[me.nextTier.name]}</span> ({me.nextTier.firstPurchasePercent}% /{" "}
            {me.nextTier.continuousPercent}%).
          </p>
        )}

        <div className="rounded-lg border border-line p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-ink-3">Your referral link</p>
            {!editingCode && (
              <button
                type="button"
                onClick={() => {
                  setCodeInput(me.ambassadorCode ?? "");
                  setEditingCode(true);
                }}
                className="text-xs font-semibold text-red-soft"
              >
                Edit
              </button>
            )}
          </div>

          {editingCode ? (
            <div className="mb-3">
              <div className="flex items-center gap-1 mb-2">
                <span className="text-sm text-ink-3 shrink-0">{typeof window !== "undefined" ? window.location.origin : ""}/signup?ref=</span>
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toLowerCase())}
                  placeholder="your-name"
                  maxLength={24}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm font-mono"
                />
              </div>
              <p className="text-[11px] text-ink-3 mb-3">Lowercase letters, numbers, and underscores only, 3-24 characters.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveCode}
                  disabled={savingCode}
                  className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {savingCode ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditingCode(false)}
                  disabled={savingCode}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm font-mono break-all mb-3">
              {typeof window !== "undefined" ? window.location.origin : ""}
              {referralPath}
            </p>
          )}

          {!editingCode && (
            <ShareButton
              title="Join me on XOLDOUT"
              text="Sign up on XOLDOUT with my link"
              path={referralPath}
              label="Copy referral link"
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="rounded-lg border border-line p-4">
            <p className="text-xs text-ink-3 mb-1">People referred</p>
            <p className="font-serif text-xl">{me.referredCount}</p>
          </div>
          <div className="rounded-lg border border-line p-4">
            <p className="text-xs text-ink-3 mb-1">Active invites</p>
            <p className="font-serif text-xl">{me.activeInviteCount}</p>
          </div>
        </div>
        <div className="rounded-lg border border-line p-4">
          <p className="text-xs text-ink-3 mb-1">Revenue generated</p>
          <p className="font-serif text-xl">{formatNaira(me.revenueGeneratedKobo ?? 0)}</p>
        </div>
      </div>
    );
  }

  if (me.application?.status === "PENDING") {
    return (
      <div className="pb-10 px-4">
        <BackHeader title="Ambassador" />
        <p className="text-sm text-ink-2">Your application is under review — we&apos;ll notify you once it&apos;s decided.</p>
      </div>
    );
  }

  return (
    <div className="pb-10 px-4">
      <BackHeader title="Ambassador" />
      {me.application?.status === "REJECTED" && (
        <div className="rounded-lg border border-line p-3 mb-4 text-sm text-ink-2">
          Your last application wasn&apos;t approved{me.application.rejectionReason ? `: ${me.application.rejectionReason}` : "."} You can
          apply again below.
        </div>
      )}
      <p className="text-sm text-ink-2 mb-4">
        Ambassadors get a referral link — anyone who signs up through it, and everything they ever buy on XOLDOUT, earns you an
        automatic commission based on your ambassador tier.
      </p>
      <textarea
        value={pitch}
        onChange={(e) => setPitch(e.target.value)}
        placeholder="Why would you be a good ambassador? (optional)"
        rows={4}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm mb-4"
      />
      <button
        onClick={handleApply}
        disabled={busy}
        className="w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Apply to be an Ambassador"}
      </button>
    </div>
  );
}
