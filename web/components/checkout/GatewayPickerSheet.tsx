"use client";

import { ENABLED_GATEWAYS, type Gateway } from "@/lib/useGatewayCheckout";

type Props = {
  open: boolean;
  onSelect: (gateway: Gateway) => void;
  onClose: () => void;
};

// Every gateway's label/description, including Flutterwave and Monnify —
// pending merchant-account approval and missing API keys (DECISIONS.md), not
// deleted. The visible list is filtered down to ENABLED_GATEWAYS so this
// file can't drift out of sync with useGatewayCheckout.ts's own idea of
// what's actually usable; re-adding either later is a one-line change to
// that array, not this one.
const LABELS: Record<Gateway, { label: string; description: string }> = {
  bachs: { label: "Bachs", description: "Card, bank transfer" },
  flutterwave: { label: "Flutterwave", description: "Card, bank transfer, USSD" },
  monnify: { label: "Monnify", description: "Card, bank transfer" },
};

const OPTIONS = ENABLED_GATEWAYS.map((value) => ({ value, ...LABELS[value] }));

// Bottom sheet, same shape as ReportSheet — dims the page behind it rather
// than covering it, closes on backdrop click. In practice this never opens
// today: useGatewayCheckout's pickGateway() only shows it when
// ENABLED_GATEWAYS holds more than one entry.
export function GatewayPickerSheet({ open, onSelect, onClose }: Props) {
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
        <h2 className="font-serif text-xl mb-1">Choose how to pay</h2>
        <p className="text-sm text-ink-3 mb-5">Pick a payment provider to continue.</p>
        <div className="flex flex-col gap-2">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className="flex items-center justify-between rounded-lg border border-line px-4 py-3.5 text-left transition-colors duration-150 hover:border-line-strong"
            >
              <div>
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-xs text-ink-3">{opt.description}</p>
              </div>
              <span className="text-ink-3">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
