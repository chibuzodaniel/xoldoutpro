"use client";

import { useState } from "react";
import { useCurrency } from "@/components/currency/CurrencyProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { DISPLAY_COUNTRIES, type DisplayCountryCode } from "@/lib/currency";

const AUTO = "auto";

// Explicit ask: users choose their country so prices switch to their local
// currency. "Auto" clears the saved choice and falls back to geo-IP
// detection. Display only — the note below says so, since every charge is
// still in NGN.
export function CountryPicker() {
  const { country, isExplicit, setCountry } = useCurrency();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function handleChange(value: string) {
    setBusy(true);
    try {
      await setCountry(value === AUTO ? null : (value as DisplayCountryCode));
    } catch {
      toast.error("Could not save your country");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4 mb-8">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold mb-0.5">Show prices in</p>
          <p className="text-xs text-ink-3">
            {country.flag} {country.name} · {country.currency}
            {!isExplicit && " (detected)"}
          </p>
        </div>
        <select
          value={isExplicit ? country.code : AUTO}
          onChange={(e) => handleChange(e.target.value)}
          disabled={busy}
          aria-label="Country"
          className="max-w-[55%] rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-sm outline-none focus:border-red disabled:opacity-50"
        >
          <option value={AUTO}>Auto-detect</option>
          {DISPLAY_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name} ({c.currency})
            </option>
          ))}
        </select>
      </div>
      <p className="text-[11px] text-ink-3">
        Converted prices are approximate. Payments are still charged in Naira (₦) — your bank converts at its own rate.
      </p>
    </div>
  );
}
