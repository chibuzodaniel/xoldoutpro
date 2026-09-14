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
  revenueGeneratedKobo?: number;
  tier?: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
  commissionPercent?: number;
  nextTier?: { name: string; remainingKobo: number; commissionPercent: number } | null;
};

const TIER_LABEL: Record<string, string> = { BRONZE: "Bronze", SILVER: "Silver", GOLD: "Gold", PLATINUM: "Platinum" };
const TIER_COLOR: Record<string, string> = {
  BRONZE: "bg-amber-900/20 text-amber-600",
  SILVER: "bg-zinc-400/20 text-zinc-400",
  GOLD: "bg-yellow-500/20 text-yellow-600",
  PLATINUM: "bg-red/15 text-red-soft",
};

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export default function AmbassadorPage() {
  const toast = useToast();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [pitch, setPitch] = useState("");
  const [busy, setBusy] = useState(false);

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
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${TIER_COLOR[me.tier ?? "BRONZE"]}`}>
            {TIER_LABEL[me.tier ?? "BRONZE"]}
          </span>
          <span className="text-xs text-ink-3">Earning {me.commissionPercent}% of platform commission on referred sales</span>
        </div>

        {me.nextTier && (
          <p className="text-xs text-ink-3 mb-6">
            {formatNaira(Math.max(me.nextTier.remainingKobo, 0))} more in referred revenue to reach{" "}
            <span className="font-semibold">{TIER_LABEL[me.nextTier.name]}</span> ({me.nextTier.commissionPercent}%).
          </p>
        )}

        <div className="rounded-lg border border-line p-4 mb-6">
          <p className="text-xs text-ink-3 mb-2">Your referral link</p>
          <p className="text-sm font-mono break-all mb-3">
            {typeof window !== "undefined" ? window.location.origin : ""}
            {referralPath}
          </p>
          <ShareButton
            title="Join me on XOLDOUT"
            text="Sign up on XOLDOUT with my link"
            path={referralPath}
            label="Copy referral link"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-line p-4">
            <p className="text-xs text-ink-3 mb-1">People referred</p>
            <p className="font-serif text-xl">{me.referredCount}</p>
          </div>
          <div className="rounded-lg border border-line p-4">
            <p className="text-xs text-ink-3 mb-1">Revenue generated</p>
            <p className="font-serif text-xl">{formatNaira(me.revenueGeneratedKobo ?? 0)}</p>
          </div>
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
