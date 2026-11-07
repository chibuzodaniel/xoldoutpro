"use client";

import { MIN_TIP_KOBO } from "@/lib/commerce/constants";

// Quick-pick tip amounts (naira). The fan can also type any amount ≥ ₦100.
const QUICK_TIPS_NAIRA = [200, 500, 1000, 2000];

/**
 * Amount picker shared by "Add a tip" at checkout and the "Tip artist"
 * button (PurchaseAndPlayer). `valueNaira` is the raw text so typing stays
 * free-form; parseTipKobo turns it into kobo for the order request.
 */
export function TipAmountPicker({
  valueNaira,
  onChange,
}: {
  valueNaira: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {QUICK_TIPS_NAIRA.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(String(n))}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
              valueNaira === String(n)
                ? "border-red text-red-soft bg-red/10"
                : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
            }`}
          >
            ₦{n.toLocaleString("en-NG")}
          </button>
        ))}
        <div className="flex items-center gap-1">
          <span className="text-sm text-ink-3">₦</span>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_TIP_KOBO / 100}
            step="1"
            placeholder="Other"
            aria-label="Tip amount in naira"
            value={valueNaira}
            onChange={(e) => onChange(e.target.value)}
            className="w-24 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none transition-colors duration-150 focus:border-red"
          />
        </div>
      </div>
      {/* Wording per explicit ask, 2026-11-07. Tips are never refunded
          (lib/commerce/ledger.ts's refundableKobo). */}
      <p className="text-[10.5px] text-ink-3">
        Tips are a way to show love and support to your favorite artist. Every tip is a gift, so make it count! ❤️🎶
      </p>
    </div>
  );
}

/** Naira text → kobo; 0 for blank. Whole naira only. */
export function nairaTextToKobo(text: string): number {
  const n = Math.floor(Number(text));
  return Number.isFinite(n) && n > 0 ? n * 100 : 0;
}
