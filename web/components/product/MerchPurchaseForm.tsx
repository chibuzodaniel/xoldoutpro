"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useGatewayCheckout, GatewayPickerCancelled } from "@/lib/useGatewayCheckout";
import { GatewayPickerSheet } from "@/components/checkout/GatewayPickerSheet";
import { useToast } from "@/components/ui/ToastProvider";

type Props = { productId: string; priceKobo: number; shippingFeeKobo: number; isSoldOut: boolean };

type Fulfillment = {
  quantity: number;
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

const STATUS_LABEL: Record<NonNullable<Fulfillment["status"]>, string> = {
  TO_SHIP: "Preparing to ship",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

export function MerchPurchaseForm({ productId, priceKobo, shippingFeeKobo, isSoldOut }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { firebaseUser } = useAuth();
  const [isOwner, setIsOwner] = useState(false);
  const [fulfillments, setFulfillments] = useState<Fulfillment[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const { gatewaySheetOpen, pickGateway, handleGatewaySelect, closeGatewaySheet } = useGatewayCheckout();
  const totalKobo = priceKobo * quantity + shippingFeeKobo;

  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  async function load() {
    const res = await apiFetch(`/api/merch/${productId}/access`);
    if (!res.ok) return;
    const data = await res.json();
    setIsOwner(data.isOwner);
    setFulfillments(data.fulfillments ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function handleStart() {
    if (!firebaseUser) {
      router.push("/login");
      return;
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
          gateway,
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
            You bought this{f.quantity > 1 ? ` · ×${f.quantity}` : ""}.
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

  if (!showForm) {
    return (
      <div className="flex flex-col gap-2">
        {pastOrders}
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
          <button onClick={handleStart} className="flex-1 rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white">
            {formatNaira(priceKobo * quantity)}
          </button>
        </div>
        {shippingFeeKobo > 0 && (
          <p className="text-xs text-ink-3">
            {formatNairaPlain(priceKobo * quantity)} + {formatNairaPlain(shippingFeeKobo)} shipping = {formatNairaPlain(totalKobo)}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {pastOrders}
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

      {shippingFeeKobo > 0 && (
        <p className="text-xs text-ink-3">
          {formatNairaPlain(priceKobo * quantity)} + {formatNairaPlain(shippingFeeKobo)} shipping = {formatNairaPlain(totalKobo)}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 mt-1"
      >
        {busy ? "Starting checkout…" : formatNaira(totalKobo)}
      </button>
      </form>
      <GatewayPickerSheet open={gatewaySheetOpen} onSelect={handleGatewaySelect} onClose={closeGatewaySheet} />
    </>
  );
}
