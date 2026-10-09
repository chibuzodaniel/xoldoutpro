"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ShieldIcon, XgCoin } from "@/components/live/LiveIcons";
import { useCurrency } from "@/components/currency/CurrencyProvider";

type Pack = { xgAmount: number; priceKobo: number; bonusPercent: number };

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// The mockup's "Add balance" block — title, explainer, coin-icon pack rows
// with "+20% bonus" callouts, and the payment-confirmed note. Rendered both
// as the full app/(app)/live/coins page body and as the bottom sheet stacked
// over the viewer's "Send a gift" sheet (app/(app)/live/[id]/page.tsx).
//
// Pay with bank (Bachs checkout) or, when there's money in the wallet,
// straight from the wallet balance (explicit ask, 2026-10-08) — that
// credits the XG instantly and fires "xoldout:xg-balance-changed" so any
// balance on screen refreshes; `onBought` lets the caller react too.
export function AddBalance({ onBought }: { onBought?: (xgAmount: number) => void } = {}) {
  const toast = useToast();
  const { country, formatPrice } = useCurrency();
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [walletKobo, setWalletKobo] = useState<number | null>(null);
  const [payWith, setPayWith] = useState<"card" | "wallet">("card");
  const [busyIndex, setBusyIndex] = useState<number | null>(null);

  useEffect(() => {
    apiFetch("/api/coins/topup")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setPacks(data.packs);
        setWalletKobo(typeof data.walletKobo === "number" ? data.walletKobo : null);
      });
  }, []);

  const canUseWallet = (walletKobo ?? 0) > 0;

  async function handleBuy(packIndex: number) {
    setBusyIndex(packIndex);
    try {
      const res = await apiFetch("/api/coins/topup", { method: "POST", body: JSON.stringify({ packIndex, payWith }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
      if (data.paid === "wallet") {
        toast.success(`${data.xgAmount.toLocaleString("en-NG")} XG added from your wallet.`);
        setWalletKobo((w) => (w === null ? w : w - data.priceKobo));
        window.dispatchEvent(new Event("xoldout:xg-balance-changed"));
        onBought?.(data.xgAmount);
        setBusyIndex(null);
        return;
      }
      // eslint-disable-next-line react-hooks/immutability -- redirecting to the Bachs checkout page, same as app/(app)/billboards/page.tsx's own handler
      window.location.href = data.checkoutUrl;
      return;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setBusyIndex(null);
    }
  }

  return (
    <div>
      <h2 className="font-serif text-[28px] leading-tight mb-1.5">Add balance</h2>
      <p className="text-[14px] text-ink-2 mb-5">XG are Xoldout Gifts you send to artists during lives.</p>

      {packs === null ? (
        <LoadingSpinner full size="md" />
      ) : (
        <div className="flex flex-col gap-1 mb-5">
          {canUseWallet && (
            <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-white/[0.04] p-1">
              {(["card", "wallet"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayWith(m)}
                  className={`rounded-lg py-2 text-[13px] font-semibold ${payWith === m ? "bg-red text-white" : "text-ink-2"}`}
                >
                  {m === "card" ? "Pay with bank" : `Wallet · ${formatNaira(walletKobo ?? 0)}`}
                </button>
              ))}
            </div>
          )}
          {packs.map((pack, i) => (
            <button
              key={i}
              onClick={() => handleBuy(i)}
              disabled={busyIndex !== null || (payWith === "wallet" && pack.priceKobo > (walletKobo ?? 0))}
              className="flex items-center gap-3.5 rounded-lg py-2 text-left transition-colors hover:bg-white/[0.03] disabled:opacity-50"
            >
              <XgCoin className="h-9 w-9 shrink-0" />
              <span className="flex-1">
                <span className="block text-[17px] font-semibold">{pack.xgAmount.toLocaleString("en-NG")} XG</span>
                {pack.bonusPercent > 0 && <span className="block text-[13px] text-red-soft">+{pack.bonusPercent}% bonus</span>}
              </span>
              <span className="text-right">
                <span className="block text-[17px] font-semibold">{busyIndex === i ? <LoadingSpinner size="sm" /> : formatNaira(pack.priceKobo)}</span>
                {country.currency !== "NGN" && <span className="block text-[12px] text-ink-3">{formatPrice(pack.priceKobo)}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="flex items-start gap-2 text-[13px] text-ink-3">
        <ShieldIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        {payWith === "wallet"
          ? "Paid from your wallet balance — XG is added straight away."
          : "Balance is only credited after your payment is confirmed."}
      </p>
    </div>
  );
}
