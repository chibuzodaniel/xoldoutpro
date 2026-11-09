"use client";

import { LICENSE_FORMATS, MAX_LICENSES, type LicenseDraft, type LicenseTerms } from "@/lib/commerce/licenseTerms";

// Beat license tiers on the publish form (v2, design/v2-prototype,
// 2026-11-09). Starts from the Basic / Premium / Exclusive presets; the
// producer switches tiers on/off and edits name, price, formats and terms.

export type TierDraft = LicenseDraft & { key: string; enabled: boolean; priceText: string };

export function tiersFromPresets(presets: LicenseDraft[]): TierDraft[] {
  return presets.map((p, i) => ({ ...p, key: `preset-${i}`, enabled: i < 2, priceText: String(p.priceKobo / 100) }));
}

/** The /api/beats payload, or an error message. */
export function tiersPayload(tiers: TierDraft[]): { licenses: LicenseDraft[] } | { error: string } {
  const on = tiers.filter((t) => t.enabled);
  if (on.length === 0) return { error: "Switch on at least one license, or choose One price" };
  if (on.length > MAX_LICENSES) return { error: `Up to ${MAX_LICENSES} licenses` };
  const licenses: LicenseDraft[] = [];
  for (const t of on) {
    const kobo = Math.round(parseFloat(t.priceText || "0") * 100);
    if (!t.name.trim()) return { error: "Each license needs a name" };
    if (!kobo || kobo <= 0) return { error: `Set a price for ${t.name}` };
    if (t.formats.length === 0) return { error: `Pick at least one file format for ${t.name}` };
    licenses.push({ name: t.name.trim(), priceKobo: kobo, formats: t.formats, isExclusive: t.isExclusive, terms: t.terms });
  }
  if (licenses.filter((l) => l.isExclusive).length > 1) return { error: "Only one license can be exclusive" };
  return { licenses };
}

const input = "rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-red";

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-2">{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-red" />
    </label>
  );
}

function NumberOrUnlimited({ label, value, unit, onChange }: { label: string; value: number | null; unit: string; onChange: (v: number | null) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-2">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          step="1"
          value={value ?? ""}
          placeholder="Unlimited"
          onChange={(e) => onChange(e.target.value ? Math.max(1, Math.floor(Number(e.target.value))) : null)}
          className={`${input} w-28`}
        />
        <span className="w-12 text-xs text-ink-3">{unit}</span>
      </span>
    </label>
  );
}

export function LicenseTiersEditor({ tiers, onChange }: { tiers: TierDraft[]; onChange: (t: TierDraft[]) => void }) {
  function update(key: string, patch: Partial<TierDraft>) {
    onChange(tiers.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }
  function updateTerms(key: string, patch: Partial<LicenseTerms>) {
    onChange(tiers.map((t) => (t.key === key ? { ...t, terms: { ...t.terms, ...patch } } : t)));
  }

  return (
    <div className="flex flex-col gap-3">
      {tiers.map((t) => (
        <div key={t.key} className={`rounded-2xl border p-4 ${t.enabled ? "border-line bg-surface" : "border-line-soft opacity-60"}`}>
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={t.enabled} onChange={(e) => update(t.key, { enabled: e.target.checked })} aria-label={`Offer ${t.name}`} className="h-5 w-5 accent-red" />
            <input value={t.name} onChange={(e) => update(t.key, { name: e.target.value.slice(0, 40) })} aria-label="License name" className={`${input} min-w-0 flex-1 font-semibold`} />
            <span className="flex items-center gap-1">
              <span className="text-sm text-ink-3">₦</span>
              <input
                type="number"
                min={1}
                step="1"
                value={t.priceText}
                onChange={(e) => update(t.key, { priceText: e.target.value })}
                aria-label={`${t.name} price`}
                className={`${input} w-28`}
              />
            </span>
          </div>

          {t.enabled && (
            <div className="mt-3 flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-ink-3">Files:</span>
                {LICENSE_FORMATS.map((f) => {
                  const on = t.formats.includes(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => update(t.key, { formats: on ? t.formats.filter((x) => x !== f) : [...t.formats, f] })}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-red bg-red/10 text-red-soft" : "border-line text-ink-2"}`}
                    >
                      {f}
                    </button>
                  );
                })}
                <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-ink-2">
                  <input type="checkbox" checked={t.isExclusive} onChange={(e) => update(t.key, { isExclusive: e.target.checked })} className="h-4 w-4 accent-red" />
                  Exclusive
                </label>
              </div>
              <NumberOrUnlimited label="Streaming limit" value={t.terms.streams} unit="streams" onChange={(v) => updateTerms(t.key, { streams: v })} />
              <Toggle label="Commercial use" value={t.terms.commercialUse} onChange={(v) => updateTerms(t.key, { commercialUse: v })} />
              <Toggle label="Monetization" value={t.terms.monetization} onChange={(v) => updateTerms(t.key, { monetization: v })} />
              <Toggle label="Music distribution" value={t.terms.distribution} onChange={(v) => updateTerms(t.key, { distribution: v })} />
              <Toggle label="Music video" value={t.terms.musicVideo} onChange={(v) => updateTerms(t.key, { musicVideo: v })} />
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink-2">YouTube and social media</span>
                <select
                  value={t.terms.youtube}
                  onChange={(e) => updateTerms(t.key, { youtube: e.target.value as LicenseTerms["youtube"] })}
                  className={input}
                >
                  <option value="monetized">Allowed (monetized)</option>
                  <option value="allowed">Allowed (non-monetized)</option>
                  <option value="no">Not allowed</option>
                </select>
              </label>
              <Toggle label="Radio" value={t.terms.radio} onChange={(v) => updateTerms(t.key, { radio: v })} />
              <NumberOrUnlimited label="Live performances" value={t.terms.livePerformances} unit="shows" onChange={(v) => updateTerms(t.key, { livePerformances: v })} />
              <Toggle label="Content ID" value={t.terms.contentId} onChange={(v) => updateTerms(t.key, { contentId: v })} />
              <NumberOrUnlimited label="License duration" value={t.terms.durationYears} unit="years" onChange={(v) => updateTerms(t.key, { durationYears: v })} />
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-2">Producer credit</span>
                <input value={t.terms.credit} onChange={(e) => updateTerms(t.key, { credit: e.target.value.slice(0, 120) })} className={input} />
              </label>
            </div>
          )}
        </div>
      ))}
      <p className="text-[10.5px] text-ink-3">
        Blank limits mean unlimited (or perpetual for duration). Selling an exclusive license closes the beat to further sales. Buyers get the master file you upload.
      </p>
    </div>
  );
}
