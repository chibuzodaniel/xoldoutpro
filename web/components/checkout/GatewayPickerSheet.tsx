"use client";

import type { Gateway } from "@/lib/useGatewayCheckout";

type Props = {
  open: boolean;
  onSelect: (gateway: Gateway) => void;
  onClose: () => void;
};

const OPTIONS: { value: Gateway; label: string; description: string }[] = [
  { value: "flutterwave", label: "Flutterwave", description: "Card, bank transfer, USSD" },
  { value: "monnify", label: "Monnify", description: "Card, bank transfer" },
];

// Bottom sheet, same shape as ReportSheet — dims the page behind it rather
// than covering it, closes on backdrop click.
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
