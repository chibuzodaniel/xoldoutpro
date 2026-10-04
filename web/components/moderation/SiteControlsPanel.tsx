"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { PANEL_KEYS, PANEL_LABEL } from "./panelKeys";

type CommissionKey = "commissionReleasePercent" | "commissionBeatPercent" | "commissionMerchPercent" | "commissionEventPercent";
const COMMISSION_KEYS: CommissionKey[] = [
  "commissionReleasePercent",
  "commissionBeatPercent",
  "commissionMerchPercent",
  "commissionEventPercent",
];
const COMMISSION_LABEL: Record<CommissionKey, string> = {
  commissionReleasePercent: "Music",
  commissionBeatPercent: "Beats",
  commissionMerchPercent: "Merchandise",
  commissionEventPercent: "Events (tickets)",
};

// Creator plans (DECISIONS.md) — Buyer Pays Fee's service-charge rates
// (music/beats/merch and events, separately) and upload cap/slot-pack
// pricing, and Limited's join/renewal fee and upload cap (sales are
// unlimited on Limited, no cap to configure). Percent fields share
// COMMISSION_KEYS' 0-90 bound; the rest are plain positive integers (or
// kobo, shown as naira same as billboardDailyRateKobo below).
type CreatorPlanPercentKey = "buyerPaysFeePercent" | "buyerPaysFeeEventPercent";
type CreatorPlanCapKey = "buyerPaysFeeUploadCap" | "buyerPaysFeeSlotPackSize" | "limitedPlanUploadCap";
type CreatorPlanKoboKey = "buyerPaysFeeSlotPackFeeKobo" | "limitedPlanFeeKobo";
type CreatorPlanKey = CreatorPlanPercentKey | CreatorPlanCapKey | CreatorPlanKoboKey;
const CREATOR_PLAN_KEYS: CreatorPlanKey[] = [
  "buyerPaysFeePercent",
  "buyerPaysFeeEventPercent",
  "buyerPaysFeeUploadCap",
  "buyerPaysFeeSlotPackSize",
  "buyerPaysFeeSlotPackFeeKobo",
  "limitedPlanFeeKobo",
  "limitedPlanUploadCap",
];
const CREATOR_PLAN_KOBO_KEYS = new Set<CreatorPlanKey>(["buyerPaysFeeSlotPackFeeKobo", "limitedPlanFeeKobo"]);
const CREATOR_PLAN_PERCENT_KEYS = new Set<CreatorPlanKey>(["buyerPaysFeePercent", "buyerPaysFeeEventPercent"]);
const CREATOR_PLAN_LABEL: Record<CreatorPlanKey, string> = {
  buyerPaysFeePercent: "Service charge (music/beats/merch)",
  // Explicit ask, 2026-09-22: events get their own rate — ticket economics
  // differ from a digital-goods sale, same reasoning as the UNLIMITED
  // commission table singling out events.
  buyerPaysFeeEventPercent: "Service charge (events)",
  buyerPaysFeeUploadCap: "Free upload cap",
  buyerPaysFeeSlotPackSize: "Slots per pack",
  buyerPaysFeeSlotPackFeeKobo: "Price per pack",
  limitedPlanFeeKobo: "Join/renewal fee",
  limitedPlanUploadCap: "Upload cap",
};

type SettingsResponse = { downloadsEnabled: boolean; billboardDailyRateKobo: number; xgPayoutRateKobo: number } & Record<CommissionKey, number> &
  Record<CreatorPlanKey, number>;

// Super-moderator-only: platform-wide toggles (real-file downloads for
// songs/beats, per-type commission rates — lib/commerce/ledger.ts's
// getCommissionRates(), what recordSale actually charges on every sale)
// and which of the panels below a *regular* moderator sees. Explicit ask,
// 2026-09-14: "super moderator should be able to turn on/off for the file
// download... and also be able to select what's visible for other
// moderators"; 2026-09-15: "moderators should be able to set how much
// percentage ... for events, music, beats, merchandise."
export function SiteControlsPanel({
  panelVisibility,
  onVisibilityChange,
}: {
  panelVisibility: Record<string, boolean> | null;
  onVisibilityChange: (v: Record<string, boolean>) => void;
}) {
  const toast = useToast();
  const [downloadsEnabled, setDownloadsEnabled] = useState<boolean | null>(null);
  const [billboardRateKobo, setBillboardRateKobo] = useState<number | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [xgRateKobo, setXgRateKobo] = useState<number | null>(null);
  const [xgRateInput, setXgRateInput] = useState("");
  const [commissionLoaded, setCommissionLoaded] = useState(false);
  const [commissionInputs, setCommissionInputs] = useState<Record<CommissionKey, string>>({
    commissionReleasePercent: "",
    commissionBeatPercent: "",
    commissionMerchPercent: "",
    commissionEventPercent: "",
  });
  const [creatorPlanLoaded, setCreatorPlanLoaded] = useState(false);
  const [creatorPlanInputs, setCreatorPlanInputs] = useState<Record<CreatorPlanKey, string>>({
    buyerPaysFeePercent: "",
    buyerPaysFeeEventPercent: "",
    buyerPaysFeeUploadCap: "",
    buyerPaysFeeSlotPackSize: "",
    buyerPaysFeeSlotPackFeeKobo: "",
    limitedPlanFeeKobo: "",
    limitedPlanUploadCap: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await apiFetch("/api/admin/settings");
      if (!res.ok) return;
      const data: SettingsResponse = await res.json();
      setDownloadsEnabled(data.downloadsEnabled);
      setBillboardRateKobo(data.billboardDailyRateKobo);
      setRateInput(String(data.billboardDailyRateKobo / 100));
      setXgRateKobo(data.xgPayoutRateKobo);
      setXgRateInput(String(data.xgPayoutRateKobo / 100));
      setCommissionInputs({
        commissionReleasePercent: String(data.commissionReleasePercent),
        commissionBeatPercent: String(data.commissionBeatPercent),
        commissionMerchPercent: String(data.commissionMerchPercent),
        commissionEventPercent: String(data.commissionEventPercent),
      });
      setCommissionLoaded(true);
      setCreatorPlanInputs({
        buyerPaysFeePercent: String(data.buyerPaysFeePercent),
        buyerPaysFeeEventPercent: String(data.buyerPaysFeeEventPercent),
        buyerPaysFeeUploadCap: String(data.buyerPaysFeeUploadCap),
        buyerPaysFeeSlotPackSize: String(data.buyerPaysFeeSlotPackSize),
        buyerPaysFeeSlotPackFeeKobo: String(data.buyerPaysFeeSlotPackFeeKobo / 100),
        limitedPlanFeeKobo: String(data.limitedPlanFeeKobo / 100),
        limitedPlanUploadCap: String(data.limitedPlanUploadCap),
      });
      setCreatorPlanLoaded(true);
    }
    load();
  }, []);

  async function saveCommissionRates() {
    const patch: Partial<Record<CommissionKey, number>> = {};
    for (const key of COMMISSION_KEYS) {
      const n = Number(commissionInputs[key]);
      if (!Number.isInteger(n) || n < 0 || n > 90) {
        toast.error("Commission rates must be whole numbers between 0 and 90.");
        return;
      }
      patch[key] = n;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/settings", { method: "PATCH", body: JSON.stringify(patch) });
      if (!res.ok) throw new Error("Could not update commission rates");
      toast.success("Commission rates updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function saveCreatorPlanSettings() {
    const patch: Partial<Record<CreatorPlanKey, number>> = {};
    for (const key of CREATOR_PLAN_KEYS) {
      const raw = Number(creatorPlanInputs[key]);
      if (CREATOR_PLAN_PERCENT_KEYS.has(key)) {
        if (!Number.isInteger(raw) || raw < 0 || raw > 90) {
          toast.error("Creator plan rates must be whole numbers between 0 and 90.");
          return;
        }
        patch[key] = raw;
      } else if (CREATOR_PLAN_KOBO_KEYS.has(key)) {
        if (!Number.isFinite(raw) || raw < 0) {
          toast.error("Creator plan fees must be a valid amount.");
          return;
        }
        patch[key] = Math.round(raw * 100);
      } else {
        if (!Number.isInteger(raw) || raw <= 0) {
          toast.error("Creator plan caps must be whole numbers greater than 0.");
          return;
        }
        patch[key] = raw;
      }
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/settings", { method: "PATCH", body: JSON.stringify(patch) });
      if (!res.ok) throw new Error("Could not update creator plan settings");
      toast.success("Creator plan settings updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function saveBillboardRate() {
    const naira = Number(rateInput);
    if (!Number.isFinite(naira) || naira <= 0) return;
    setBusy(true);
    try {
      const kobo = Math.round(naira * 100);
      const res = await apiFetch("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ billboardDailyRateKobo: kobo }) });
      if (!res.ok) throw new Error("Could not update rate");
      setBillboardRateKobo(kobo);
      toast.success(`Billboard rate is now ₦${naira.toLocaleString("en-NG")}/day.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function saveXgRate() {
    const naira = Number(xgRateInput);
    const kobo = Math.round(naira * 100);
    if (!Number.isFinite(naira) || kobo <= 0) {
      toast.error("The XG rate must be more than ₦0.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ xgPayoutRateKobo: kobo }) });
      if (!res.ok) throw new Error("Could not update XG rate");
      setXgRateKobo(kobo);
      toast.success(`Creators now earn ₦${naira.toLocaleString("en-NG")} per XG received.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function toggleDownloads(enabled: boolean) {
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ downloadsEnabled: enabled }) });
      if (!res.ok) throw new Error("Could not update setting");
      setDownloadsEnabled(enabled);
      toast.success(`File downloads are now ${enabled ? "on" : "off"} for everyone.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function togglePanel(key: string, visible: boolean) {
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/panel-visibility", {
        method: "PATCH",
        body: JSON.stringify({ panelKey: key, visible }),
      });
      if (!res.ok) throw new Error("Could not update panel visibility");
      onVisibilityChange({ ...(panelVisibility ?? {}), [key]: visible });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Site controls</p>

      <div className="flex items-center justify-between py-2.5 border-b border-line-soft mb-3">
        <div>
          <p className="text-sm font-semibold">Song/beat file downloads</p>
          <p className="text-xs text-ink-3">Turns the real-file Download button off for everyone when disabled.</p>
        </div>
        {downloadsEnabled === null ? (
          <span className="text-xs text-ink-3">Loading…</span>
        ) : (
          <button
            type="button"
            onClick={() => toggleDownloads(!downloadsEnabled)}
            disabled={busy}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
              downloadsEnabled ? "bg-green/15 text-green" : "bg-red/15 text-red-soft"
            }`}
          >
            {downloadsEnabled ? "On" : "Off"}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between py-2.5 border-b border-line-soft mb-3">
        <div>
          <p className="text-sm font-semibold">Billboard daily rate</p>
          <p className="text-xs text-ink-3">What a creator pays per day for the Discover billboard rail.</p>
        </div>
        {billboardRateKobo === null ? (
          <span className="text-xs text-ink-3">Loading…</span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-3">₦</span>
            <input
              type="number"
              min={1}
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={saveBillboardRate}
              disabled={busy}
              className="rounded-full bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 py-2.5 border-b border-line-soft mb-3">
        <div>
          <p className="text-sm font-semibold">XG payout rate</p>
          <p className="text-xs text-ink-3">
            What a creator earns per XG received on Live. Paid into their wallet on the 1st of each month; a change only
            affects XG received after it.
          </p>
        </div>
        {xgRateKobo === null ? (
          <span className="text-xs text-ink-3">Loading…</span>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-ink-3">₦</span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={xgRateInput}
              onChange={(e) => setXgRateInput(e.target.value)}
              className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={saveXgRate}
              disabled={busy}
              className="rounded-full bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
        )}
      </div>

      <div className="py-2.5 border-b border-line-soft mb-3">
        <p className="text-sm font-semibold mb-0.5">Unlimited plan commission</p>
        <p className="text-xs text-ink-3 mb-3">
          What XOLDOUT keeps per sale, by product type, for creators on the Unlimited plan — the rest goes to the seller.
          Buyer Pays Fee and Limited plan sellers use the rates below instead.
        </p>
        {!commissionLoaded ? (
          <p className="text-xs text-ink-3">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              {COMMISSION_KEYS.map((key) => (
                <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                  <span className="text-xs text-ink-2">{COMMISSION_LABEL[key]}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={commissionInputs[key]}
                      onChange={(e) => setCommissionInputs((cur) => ({ ...cur, [key]: e.target.value }))}
                      className="w-12 rounded-lg border border-line bg-surface px-1.5 py-1 text-xs text-right"
                    />
                    <span className="text-xs text-ink-3">%</span>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={saveCommissionRates}
              disabled={busy}
              className="rounded-full bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Save commission rates
            </button>
          </>
        )}
      </div>

      <div className="py-2.5 border-b border-line-soft mb-3">
        <p className="text-sm font-semibold mb-0.5">Creator plans</p>
        <p className="text-xs text-ink-3 mb-3">Buyer Pays Fee&rsquo;s service charges and storage, and Limited&rsquo;s join/renewal fee and upload cap.</p>
        {!creatorPlanLoaded ? (
          <p className="text-xs text-ink-3">Loading…</p>
        ) : (
          <>
            <p className="text-xs font-semibold text-ink-2 mb-1.5">Buyer Pays Fee</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              {(
                ["buyerPaysFeePercent", "buyerPaysFeeEventPercent", "buyerPaysFeeUploadCap", "buyerPaysFeeSlotPackSize", "buyerPaysFeeSlotPackFeeKobo"] as const
              ).map(
                (key) => (
                  <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                    <span className="text-xs text-ink-2">{CREATOR_PLAN_LABEL[key]}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {CREATOR_PLAN_KOBO_KEYS.has(key) && <span className="text-xs text-ink-3">₦</span>}
                      <input
                        type="number"
                        min={0}
                        value={creatorPlanInputs[key]}
                        onChange={(e) => setCreatorPlanInputs((cur) => ({ ...cur, [key]: e.target.value }))}
                        className="w-16 rounded-lg border border-line bg-surface px-1.5 py-1 text-xs text-right"
                      />
                      {CREATOR_PLAN_PERCENT_KEYS.has(key) && <span className="text-xs text-ink-3">%</span>}
                    </div>
                  </div>
                ),
              )}
            </div>
            <p className="text-xs font-semibold text-ink-2 mb-1.5">Limited</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              {(["limitedPlanFeeKobo", "limitedPlanUploadCap"] as const).map((key) => (
                <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                  <span className="text-xs text-ink-2">{CREATOR_PLAN_LABEL[key]}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {CREATOR_PLAN_KOBO_KEYS.has(key) && <span className="text-xs text-ink-3">₦</span>}
                    <input
                      type="number"
                      min={0}
                      value={creatorPlanInputs[key]}
                      onChange={(e) => setCreatorPlanInputs((cur) => ({ ...cur, [key]: e.target.value }))}
                      className="w-16 rounded-lg border border-line bg-surface px-1.5 py-1 text-xs text-right"
                    />
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={saveCreatorPlanSettings}
              disabled={busy}
              className="rounded-full bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Save creator plan settings
            </button>
          </>
        )}
      </div>

      <p className="text-xs text-ink-3 mb-2">Visible to regular moderators</p>
      {panelVisibility === null ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {PANEL_KEYS.map((key) => (
            <label key={key} className="flex items-center justify-between py-2.5 text-sm">
              <span>{PANEL_LABEL[key]}</span>
              <input
                type="checkbox"
                checked={panelVisibility[key] ?? true}
                disabled={busy}
                onChange={(e) => togglePanel(key, e.target.checked)}
                className="h-4 w-4"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
