"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";

type Props = { productId: string; priceKobo: number; shippingFeeKobo: number; isSoldOut: boolean };

type Fulfillment = {
  status: "TO_SHIP" | "SHIPPED" | "DELIVERED";
  recipientName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  country: string;
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

const STATUS_LABEL: Record<Fulfillment["status"], string> = {
  TO_SHIP: "Preparing to ship",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

export function MerchPurchaseForm({ productId, priceKobo, shippingFeeKobo, isSoldOut }: Props) {
  const totalKobo = priceKobo + shippingFeeKobo;
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const [entitled, setEntitled] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [fulfillment, setFulfillment] = useState<Fulfillment | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setEntitled(data.entitled);
    setIsOwner(data.isOwner);
    setFulfillment(data.fulfillment);
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
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          productId,
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
      } else {
        router.push(data.checkoutUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (entitled) {
    return (
      <div className="rounded-lg border border-line bg-surface p-4">
        <p className="text-sm font-semibold mb-1">You bought this.</p>
        {fulfillment && (
          <>
            <p className="text-xs text-red-soft font-semibold mb-2">{STATUS_LABEL[fulfillment.status]}</p>
            <p className="text-xs text-ink-3">
              {fulfillment.recipientName} · {fulfillment.addressLine1}
              {fulfillment.addressLine2 ? `, ${fulfillment.addressLine2}` : ""}, {fulfillment.city}, {fulfillment.state}
            </p>
            <p className="text-xs text-ink-3 mt-1">
              {formatNairaPlain(priceKobo)}
              {fulfillment.shippingFeeKobo > 0 ? ` + ${formatNairaPlain(fulfillment.shippingFeeKobo)} shipping` : ""}
            </p>
            {fulfillment.trackingInfo && <p className="text-xs text-ink-3 mt-1">Tracking: {fulfillment.trackingInfo}</p>}
          </>
        )}
      </div>
    );
  }

  if (isOwner) return null;

  if (!showForm) {
    return (
      <div>
        {shippingFeeKobo > 0 && !isSoldOut && (
          <p className="text-xs text-ink-3 mb-2">
            {formatNairaPlain(priceKobo)} + {formatNairaPlain(shippingFeeKobo)} shipping = {formatNairaPlain(totalKobo)}
          </p>
        )}
        <button
          onClick={handleStart}
          disabled={isSoldOut}
          className="w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isSoldOut ? "Sold out" : formatNaira(priceKobo)}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
          {formatNairaPlain(priceKobo)} + {formatNairaPlain(shippingFeeKobo)} shipping = {formatNairaPlain(totalKobo)}
        </p>
      )}

      {error && <p className="text-sm text-red-soft">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 mt-1"
      >
        {busy ? "Starting checkout…" : formatNaira(totalKobo)}
      </button>
    </form>
  );
}
