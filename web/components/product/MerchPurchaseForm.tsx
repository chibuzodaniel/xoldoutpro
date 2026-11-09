"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useGatewayCheckout, GatewayPickerCancelled } from "@/lib/useGatewayCheckout";
import { useGuestCheckout, GuestInfoCancelled, completeGuestSignIn, rememberGuestOrder, type GuestInfo } from "@/lib/useGuestCheckout";
import { GatewayPickerSheet } from "@/components/checkout/GatewayPickerSheet";
import { GuestInfoSheet } from "@/components/checkout/GuestInfoSheet";
import { useToast } from "@/components/ui/ToastProvider";
import { ChargeNote } from "@/components/currency/CurrencyProvider";
import { addToCart } from "@/lib/cart";

// Merch sizes & colours (v2, 2026-11-09). Empty = a plain listing, as before.
export type MerchVariantOption = { id: string; size: string | null; color: string | null; soldOut: boolean; remaining: number | null };

type Props = {
  productId: string;
  priceKobo: number;
  shippingFeeKobo: number;
  isSoldOut: boolean;
  variants?: MerchVariantOption[];
  sizeGuide?: string | null;
  // For the cart line (v2 cart).
  title?: string;
  artistName?: string;
  imageUrl?: string | null;
};

type Fulfillment = {
  quantity: number;
  variantLabel?: string | null;
  status: "TO_SHIP" | "SHIPPED" | "DELIVERED" | null;
  recipientName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  shippingFeeKobo: number;
  shippedAt: string | null;
  trackingInfo: string | null;
};

function formatNairaPlain(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function formatNaira(kobo: number) {
  if (kobo === 0) return "Get for free";
  return `Buy · ${formatNairaPlain(kobo)}`;
}

function breakdownText(priceTotalKobo: number, shippingFeeKobo: number, serviceChargePercent: number | null, serviceChargeKobo: number) {
  const parts = [formatNairaPlain(priceTotalKobo)];
  if (shippingFeeKobo > 0) parts.push(`${formatNairaPlain(shippingFeeKobo)} shipping`);
  // The percentage itself isn't shown (explicit ask, 2026-11-07) — just the amount.
  if (serviceChargePercent != null) parts.push(`${formatNairaPlain(serviceChargeKobo)} service charge`);
  return `${parts.join(" + ")} = ${formatNairaPlain(priceTotalKobo + shippingFeeKobo + serviceChargeKobo)} total`;
}

const STATUS_LABEL: Record<NonNullable<Fulfillment["status"]>, string> = {
  TO_SHIP: "Preparing to ship",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

export function MerchPurchaseForm({ productId, priceKobo, shippingFeeKobo, isSoldOut, variants = [], sizeGuide, title, artistName, imageUrl }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { firebaseUser } = useAuth();
  const [isOwner, setIsOwner] = useState(false);
  const [fulfillments, setFulfillments] = useState<Fulfillment[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const { gatewaySheetOpen, pickGateway, handleGatewaySelect, closeGatewaySheet } = useGatewayCheckout();
  const { guestInfoSheetOpen, pickGuestInfo, handleGuestInfoSubmit, closeGuestInfoSheet } = useGuestCheckout();
  const [guestInfo, setGuestInfo] = useState<GuestInfo | null>(null);
  const [serviceChargePercent, setServiceChargePercent] = useState<number | null>(null);
  const baseKobo = priceKobo * quantity + shippingFeeKobo;
  // Creator plans (DECISIONS.md): same formula app/api/orders/route.ts uses
  // to compute the actual charge for a BUYER_PAYS_FEE seller.
  const serviceChargeKobo = serviceChargePercent != null ? Math.round((baseKobo * serviceChargePercent) / 100) : 0;
  const totalKobo = baseKobo + serviceChargeKobo;

  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  // Size/colour picker. A listing can have sizes, colours, or both.
  const sizes = [...new Set(variants.map((v) => v.size).filter((s): s is string => Boolean(s)))];
  const colors = [...new Set(variants.map((v) => v.color).filter((c): c is string => Boolean(c)))];
  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const hasVariants = variants.length > 0;
  const chosen = hasVariants
    ? (variants.find((v) => (sizes.length ? v.size === size : true) && (colors.length ? v.color === color : true)) ?? null)
    : null;
  const optionSoldOut = (s: string | null, c: string | null) =>
    !variants.some((v) => (s === null || v.size === s) && (c === null || v.color === c) && !v.soldOut);

  async function load() {
    const res = await apiFetch(`/api/merch/${productId}/access`);
    if (!res.ok) return;
    const data = await res.json();
    setIsOwner(data.isOwner);
    setFulfillments(data.fulfillments ?? []);
    setServiceChargePercent(data.serviceChargePercent ?? null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function handleStart() {
    if (hasVariants && !chosen) {
      toast.error(sizes.length && colors.length ? "Pick a size and a colour" : sizes.length ? "Pick a size" : "Pick a colour");
      return;
    }
    if (chosen?.soldOut) {
      toast.error("That option is sold out");
      return;
    }
    if (!firebaseUser) {
      try {
        setGuestInfo(await pickGuestInfo());
      } catch (err) {
        if (err instanceof GuestInfoCancelled) return;
        throw err;
      }
    }
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const gateway = totalKobo > 0 ? await pickGateway() : undefined;
      const res = await apiFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          productId,
          quantity,
          variantId: chosen?.id,
          gateway,
          guest: guestInfo ?? undefined,
          shipping: {
            recipientName,
            phone,
            addressLine1,
            addressLine2: addressLine2 || undefined,
            city,
            state,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
      if (data.customToken) await completeGuestSignIn(data.customToken);
      rememberGuestOrder(data.orderId, data.guestOrderToken);
      if (data.free) {
        await load();
        setShowForm(false);
        setQuantity(1);
      } else {
        router.push(data.checkoutUrl);
      }
    } catch (err) {
      if (err instanceof GatewayPickerCancelled) return;
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (isOwner) return null;

  const pastOrders = fulfillments.length > 0 && (
    <div className="flex flex-col gap-2">
      {fulfillments.map((f, i) => (
        <div key={i} className="rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold mb-1">
            You bought this{f.variantLabel ? ` · ${f.variantLabel}` : ""}{f.quantity > 1 ? ` · ×${f.quantity}` : ""}.
          </p>
          {f.status && (
            <>
              <p className="text-xs text-red-soft font-semibold mb-2">{STATUS_LABEL[f.status]}</p>
              <p className="text-xs text-ink-3">
                {f.recipientName} · {f.addressLine1}
                {f.addressLine2 ? `, ${f.addressLine2}` : ""}, {f.city}, {f.state}
              </p>
              <p className="text-xs text-ink-3 mt-1">
                {formatNairaPlain(priceKobo * f.quantity)}
                {f.shippingFeeKobo > 0 ? ` + ${formatNairaPlain(f.shippingFeeKobo)} shipping` : ""}
              </p>
              {f.trackingInfo && <p className="text-xs text-ink-3 mt-1">Tracking: {f.trackingInfo}</p>}
            </>
          )}
        </div>
      ))}
    </div>
  );

  if (isSoldOut) {
    return (
      <div className="flex flex-col gap-2">
        {pastOrders}
        <div className="w-full rounded-lg border border-line px-4 py-3 text-sm font-semibold text-ink-3 text-center">Sold out</div>
      </div>
    );
  }

  const picker = hasVariants && (
    <div className="flex flex-col gap-3">
      {sizes.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3">Size{size ? `: ${size}` : ""}</p>
            {sizeGuide && (
              <button type="button" onClick={() => setGuideOpen((v) => !v)} className="text-xs font-semibold text-red-soft">
                {guideOpen ? "Hide size guide" : "Size guide"}
              </button>
            )}
          </div>
          {guideOpen && sizeGuide && <p className="mb-2 whitespace-pre-line rounded-xl border border-line-soft p-3 text-xs text-ink-2">{sizeGuide}</p>}
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => {
              const out = optionSoldOut(s, colors.length ? color : null);
              return (
                <button
                  key={s}
                  type="button"
                  disabled={out}
                  onClick={() => setSize(s)}
                  className={`min-w-[48px] rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                    size === s ? "border-red bg-red/10 text-red-soft" : "border-line text-ink-2"
                  } disabled:line-through disabled:opacity-40`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {colors.length > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-bold uppercase tracking-widest text-ink-3">Colour{color ? `: ${color}` : ""}</p>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => {
              const out = optionSoldOut(sizes.length ? size : null, c);
              return (
                <button
                  key={c}
                  type="button"
                  disabled={out}
                  onClick={() => setColor(c)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                    color === c ? "border-red bg-red/10 text-red-soft" : "border-line text-ink-2"
                  } disabled:line-through disabled:opacity-40`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {chosen && chosen.remaining !== null && !chosen.soldOut && chosen.remaining <= 10 && (
        <p className="text-xs font-semibold text-red-soft">Only {chosen.remaining} left in this option</p>
      )}
    </div>
  );

  if (!showForm) {
    return (
      <>
        <div className="flex flex-col gap-3">
          {pastOrders}
          {picker}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-line shrink-0">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Fewer"
                className="w-9 h-full py-3 text-ink-2 disabled:opacity-30"
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-semibold">{quantity}</span>
              <button type="button" onClick={() => setQuantity((q) => q + 1)} aria-label="More" className="w-9 h-full py-3 text-ink-2">
                +
              </button>
            </div>
            <button onClick={handleStart} className="flex-1 rounded-full bg-red px-5 py-4 text-[16px] font-bold text-white">
              {formatNaira(priceKobo * quantity)}
            </button>
          </div>
          {priceKobo > 0 && (
            <button
              type="button"
              onClick={() => {
                if (hasVariants && !chosen) {
                  toast.error(sizes.length && colors.length ? "Pick a size and a colour" : sizes.length ? "Pick a size" : "Pick a colour");
                  return;
                }
                if (chosen?.soldOut) return toast.error("That option is sold out");
                addToCart({
                  productId,
                  type: "MERCH",
                  title: title ?? "Merch",
                  artistName: artistName ?? "",
                  imageUrl: imageUrl ?? null,
                  href: `/m/${productId}`,
                  unitPriceKobo: priceKobo,
                  quantity,
                  variantId: chosen?.id,
                  variantLabel: chosen ? [chosen.size, chosen.color].filter(Boolean).join(" · ") : undefined,
                });
                toast.success("Added to cart");
              }}
              className="rounded-full border border-line px-5 py-3.5 text-[15px] font-bold text-ink"
            >
              Add to cart
            </button>
          )}
          {(shippingFeeKobo > 0 || serviceChargePercent != null) && (
            <p className="text-xs text-ink-3">{breakdownText(priceKobo * quantity, shippingFeeKobo, serviceChargePercent, serviceChargeKobo)}</p>
          )}
        </div>
        <GuestInfoSheet open={guestInfoSheetOpen} onSubmit={handleGuestInfoSubmit} onClose={closeGuestInfoSheet} />
      </>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {pastOrders}
        {chosen && (
          <p className="text-sm text-ink-2">
            Option: <span className="font-semibold text-ink">{[chosen.size, chosen.color].filter(Boolean).join(" · ")}</span>
          </p>
        )}
        <p className="text-[12px] uppercase tracking-widest text-ink-3">Shipping address</p>
      <input
        value={recipientName}
        onChange={(e) => setRecipientName(e.target.value)}
        placeholder="Recipient name"
        required
        className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone number"
        required
        className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red"
      />
      <input
        value={addressLine1}
        onChange={(e) => setAddressLine1(e.target.value)}
        placeholder="Address line 1"
        required
        className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red"
      />
      <input
        value={addressLine2}
        onChange={(e) => setAddressLine2(e.target.value)}
        placeholder="Address line 2 (optional)"
        className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red"
      />
      <div className="flex gap-2">
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City"
          required
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red"
        />
        <input
          value={state}
          onChange={(e) => setState(e.target.value)}
          placeholder="State"
          required
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red"
        />
      </div>

      <ChargeNote kobo={totalKobo} />
      {(shippingFeeKobo > 0 || serviceChargePercent != null) && (
        <p className="text-xs text-ink-3">{breakdownText(priceKobo * quantity, shippingFeeKobo, serviceChargePercent, serviceChargeKobo)}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-red px-5 py-4 text-[16px] font-bold text-white disabled:opacity-50 mt-1"
      >
        {busy ? "Starting checkout…" : formatNaira(totalKobo)}
      </button>
      </form>
      <GatewayPickerSheet open={gatewaySheetOpen} onSelect={handleGatewaySelect} onClose={closeGatewaySheet} />
      <GuestInfoSheet open={guestInfoSheetOpen} onSubmit={handleGuestInfoSubmit} onClose={closeGuestInfoSheet} />
    </>
  );
}
