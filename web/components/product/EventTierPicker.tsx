"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PromoterCard } from "@/components/event/PromoterCard";
import { ProductShareSheet, type ShareItem } from "@/components/product/ProductShareSheet";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useGatewayCheckout, GatewayPickerCancelled } from "@/lib/useGatewayCheckout";
import { useGuestCheckout, GuestInfoCancelled, completeGuestSignIn, rememberGuestOrder, type GuestInfo } from "@/lib/useGuestCheckout";
import { GatewayPickerSheet } from "@/components/checkout/GatewayPickerSheet";
import { GuestInfoSheet } from "@/components/checkout/GuestInfoSheet";
import { useToast } from "@/components/ui/ToastProvider";
import { ChargeNote } from "@/components/currency/CurrencyProvider";

type Tier = { productId: string; name: string; priceKobo: number; isSoldOut: boolean; remaining?: number | null };

type OwnedTicket = { checkInCode: string | null; checkedInAt: string | null };
type AccessTier = { productId: string; entitled: boolean; tickets: OwnedTicket[] };


function nairaAmount(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// useSearchParams (for the `?promo=` promoter link) requires a Suspense
// boundary — same pattern as app/(app)/library/page.tsx's own wrapper.
export function EventTierPicker(props: { eventId: string; tiers: Tier[]; share?: ShareItem }) {
  return (
    <Suspense fallback={null}>
      <EventTierPickerInner {...props} />
    </Suspense>
  );
}

function EventTierPickerInner({ eventId, tiers, share }: { eventId: string; tiers: Tier[]; share?: ShareItem }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const promoCode = searchParams.get("promo") ?? undefined;
  const toast = useToast();
  const { firebaseUser } = useAuth();
  const [access, setAccess] = useState<Record<string, AccessTier> | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Discount code (2026-11-11): checked for the selected ticket type; checkout re-checks it.
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [applied, setApplied] = useState<{ code: string; tierId: string; unitPriceKobo: number; name: string } | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [serviceChargePercent, setServiceChargePercent] = useState<number | null>(null);
  const { gatewaySheetOpen, pickGateway, handleGatewaySelect, closeGatewaySheet } = useGatewayCheckout();
  const { guestInfoSheetOpen, pickGuestInfo, handleGuestInfoSubmit, closeGuestInfoSheet } = useGuestCheckout();

  async function load() {
    const res = await apiFetch(`/api/events/${eventId}/access`);
    if (!res.ok) return;
    const data = await res.json();
    setIsOwner(data.isOwner);
    setServiceChargePercent(data.serviceChargePercent ?? null);
    const map: Record<string, AccessTier> = {};
    for (const t of data.tiers as AccessTier[]) map[t.productId] = t;
    setAccess(map);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // A visit through a promoter's link counts once per browser session.
  useEffect(() => {
    if (!promoCode) return;
    const key = `promo-click:${eventId}:${promoCode}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // storage blocked — still count it
    }
    void apiFetch(`/api/events/${eventId}/promoters/click`, { method: "POST", body: JSON.stringify({ code: promoCode }) }).catch(() => {});
  }, [eventId, promoCode]);

  async function checkCode(tierId: string) {
    const code = codeInput.trim();
    if (!code) return;
    setCheckingCode(true);
    try {
      const res = await apiFetch(`/api/events/${eventId}/discounts/check?code=${encodeURIComponent(code)}&tier=${encodeURIComponent(tierId)}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "That code isn't valid");
      setApplied({ code, tierId, unitPriceKobo: d.unitPriceKobo, name: d.name });
      toast.success(`${d.name} applied`);
    } catch (err) {
      setApplied(null);
      toast.error(err instanceof Error ? err.message : "That code isn't valid");
    } finally {
      setCheckingCode(false);
    }
  }

  function quantityFor(productId: string) {
    return quantities[productId] ?? 1;
  }

  function setQuantity(productId: string, qty: number) {
    setQuantities((cur) => ({ ...cur, [productId]: Math.max(1, qty) }));
  }

  async function handleBuy(productId: string) {
    setBusyProductId(productId);
    try {
      const guest: GuestInfo | undefined = firebaseUser ? undefined : await pickGuestInfo();
      const priceKobo = tiers.find((t) => t.productId === productId)?.priceKobo ?? 0;
      const gateway = priceKobo > 0 ? await pickGateway() : undefined;
      const res = await apiFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify({ productId, quantity: quantityFor(productId), guest, gateway, promoCode, discountCode: applied?.tierId === productId ? applied.code : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
      if (data.customToken) await completeGuestSignIn(data.customToken);
      rememberGuestOrder(data.orderId, data.guestOrderToken);
      if (data.free) {
        await load();
      } else {
        router.push(data.checkoutUrl);
      }
    } catch (err) {
      if (err instanceof GatewayPickerCancelled || err instanceof GuestInfoCancelled) return;
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyProductId(null);
    }
  }

  if (isOwner) return null;

  // Event page v2 (user's reference, 2026-11-11): selectable tier cards, a
  // pinned "Buy tickets" bar, and owned tickets as a count that links to the
  // Library — the QR codes themselves are only shown there, never here.
  const ownedCount = access ? Object.values(access).reduce((n, t) => n + t.tickets.length, 0) : 0;
  const onSale = tiers.filter((t) => !t.isSoldOut);
  const selected = onSale.find((t) => t.productId === selectedId) ?? onSale[0] ?? null;
  const qty = selected ? quantityFor(selected.productId) : 1;
  const unit = selected ? (applied?.tierId === selected.productId ? applied.unitPriceKobo : selected.priceKobo) : 0;
  const subtotal = selected ? unit * qty : 0;
  const total = serviceChargePercent != null ? subtotal + Math.round((subtotal * serviceChargePercent) / 100) : subtotal;
  const remainingAll = tiers.every((t) => t.remaining != null) ? tiers.reduce((n, t) => n + (t.remaining ?? 0), 0) : null;

  return (
    <section className="mt-7">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[28px] font-bold">Tickets</h2>
        {remainingAll != null && <span className="text-[15px] text-ink-3">{remainingAll.toLocaleString("en-NG")} remaining</span>}
      </div>

      {ownedCount > 0 && (
        <Link href="/library" className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 py-3.5">
          <span className="text-[15px] font-semibold">
            You have {ownedCount} ticket{ownedCount === 1 ? "" : "s"} for this event
          </span>
          <span className="shrink-0 text-[14px] font-semibold text-red-soft">View in Library ›</span>
        </Link>
      )}

      <div className="flex flex-col gap-2.5">
        {tiers.map((tier) => {
          const isSel = selected?.productId === tier.productId;
          return (
            <button
              key={tier.productId}
              type="button"
              disabled={tier.isSoldOut}
              onClick={() => setSelectedId(tier.productId)}
              aria-pressed={isSel}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-5 py-4 text-left transition-colors duration-150 disabled:opacity-50 ${
                isSel ? "border-red bg-red/10" : "border-white/10 bg-[#0f0f0f]"
              }`}
            >
              <span className="min-w-0">
                <span className="block text-[18px] font-semibold">{tier.name}</span>
                <span className="block text-[13px] text-ink-3">
                  {tier.isSoldOut ? "Sold out" : tier.remaining != null ? `${tier.remaining.toLocaleString("en-NG")} left` : "Available"}
                </span>
              </span>
              <span className="shrink-0 text-[19px] font-bold text-red-soft">{tier.priceKobo === 0 ? "Free" : nairaAmount(tier.priceKobo)}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[14px] text-ink-2">Quantity</span>
          <div className="flex items-center rounded-full border border-line">
            <button type="button" onClick={() => setQuantity(selected.productId, qty - 1)} disabled={qty <= 1} aria-label="Fewer" className="h-10 w-10 text-ink-2 disabled:opacity-30">
              −
            </button>
            <span className="w-6 text-center text-sm font-semibold">{qty}</span>
            <button type="button" onClick={() => setQuantity(selected.productId, qty + 1)} aria-label="More" className="h-10 w-10 text-ink-2">
              +
            </button>
          </div>
        </div>
      )}
      {selected && selected.priceKobo > 0 && serviceChargePercent != null && (
        <p className="mt-2 text-xs text-ink-3">
          {nairaAmount(subtotal)} + {nairaAmount(total - subtotal)} service charge ({serviceChargePercent}%) = {nairaAmount(total)} total
        </p>
      )}
      {selected && <ChargeNote kobo={total} />}
      {selected && applied?.tierId === selected.productId && (
        <p className="mt-2 text-[13px] font-semibold text-green">
          {applied.name}: {nairaAmount(selected.priceKobo)} → {nairaAmount(unit)} per ticket
        </p>
      )}

      {/* Use Discount Code | Share Event (user's example, 2026-11-11). Automatic
          offers (early bird) apply at checkout without a code. */}
      <div className="mt-4 flex items-stretch rounded-2xl border border-white/10 bg-[#0f0f0f]">
        <button type="button" onClick={() => setCodeOpen((v) => !v)} className="flex flex-1 items-center gap-2.5 px-4 py-3.5 text-left text-[15px]">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-ink-2" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M3 12V4h8l10 10-8 8L3 12z" strokeLinejoin="round" />
            <circle cx="7.5" cy="8.5" r="1.4" />
          </svg>
          <span className="flex-1">Use Discount Code</span>
          <span className={`text-ink-3 transition-transform ${codeOpen ? "rotate-180" : ""}`}>⌄</span>
        </button>
        {share && (
          <>
            <span className="my-3 w-px bg-white/15" aria-hidden />
            <button type="button" onClick={() => setShareOpen(true)} className="flex items-center gap-2 px-4 text-[14px]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M16 11a3 3 0 100-6 3 3 0 000 6zM8 11a3 3 0 100-6 3 3 0 000 6zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4zm8 0c-.3 0-.7 0-1.1.1 1.2.9 2.1 2.1 2.1 3.9v2h7v-2c0-2.7-5.3-4-8-4z" />
              </svg>
              Share Event
            </button>
          </>
        )}
      </div>
      {codeOpen && selected && (
        <div className="mt-2 flex gap-2">
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase().slice(0, 30))}
            placeholder="Enter code"
            aria-label="Discount code"
            className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-sm uppercase outline-none focus:border-red"
          />
          <button type="button" onClick={() => checkCode(selected.productId)} disabled={checkingCode || !codeInput.trim()} className="rounded-full border border-line px-4 text-sm font-semibold disabled:opacity-50">
            {checkingCode ? "Checking…" : "Apply"}
          </button>
        </div>
      )}
      <PromoterCard eventId={eventId} />
      {share && <ProductShareSheet open={shareOpen} onClose={() => setShareOpen(false)} item={share} />}

      <div className="sticky bottom-0 z-10 -mx-4 mt-5 flex items-center gap-3 border-t border-line-soft bg-bg/95 px-4 py-3 backdrop-blur">
        <Link href="/cart" aria-label="Cart" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line text-ink">
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M3 4h2l2.2 11h10.6L20 7H6.2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="19.5" r="1.3" />
            <circle cx="17" cy="19.5" r="1.3" />
          </svg>
        </Link>
        {selected ? (
          <button
            type="button"
            onClick={() => handleBuy(selected.productId)}
            disabled={busyProductId !== null || !access}
            className="min-h-14 flex-1 rounded-full bg-red px-5 py-4 text-[17px] font-bold text-white disabled:opacity-50"
          >
            {busyProductId ? "Starting checkout…" : total === 0 ? `Get free ticket${qty > 1 ? "s" : ""}` : `Buy tickets · ${nairaAmount(total)}`}
          </button>
        ) : (
          <span className="flex min-h-14 flex-1 items-center justify-center rounded-full border border-line text-[16px] font-semibold text-ink-3">Sold out</span>
        )}
      </div>

      <GatewayPickerSheet open={gatewaySheetOpen} onSelect={handleGatewaySelect} onClose={closeGatewaySheet} />
      <GuestInfoSheet open={guestInfoSheetOpen} onSubmit={handleGuestInfoSubmit} onClose={closeGuestInfoSheet} />
    </section>
  );
}
