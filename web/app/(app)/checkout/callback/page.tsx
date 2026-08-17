"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

type OrderStatus = "PENDING" | "PAID" | "REFUNDED" | "FAILED";

// Flutterwave redirects here after checkout; the webhook is the source of
// truth (PRD §16: idempotent, may arrive before or after this redirect), so
// this page just polls order status until the webhook has caught up.
export default function CheckoutCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutCallbackInner />
    </Suspense>
  );
}

function CheckoutCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("tx_ref");
  const [status, setStatus] = useState<OrderStatus | "LOADING">("LOADING");
  const [productId, setProductId] = useState<string | null>(null);
  const [productType, setProductType] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    async function poll() {
      const res = await apiFetch(`/api/orders/${orderId}`);
      if (!res.ok || cancelled) return;
      const { order } = await res.json();
      const item = order.items[0];
      setProductId(item?.product?.id ?? null);
      setProductType(item?.product?.type ?? null);
      setEventId(item?.product?.ticketTier?.eventId ?? null);
      if (order.status === "PAID" || order.status === "FAILED") {
        setStatus(order.status);
        return;
      }
      setTimeout(poll, 1500);
    }
    poll();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // Each sellable type gets its own detail route. Event is keyed by
  // Event.id, not the purchased tier's Product.id, so it needs its own field.
  function productHref() {
    if (productType === "EVENT") return eventId ? `/e/${eventId}` : null;
    if (!productId) return null;
    if (productType === "BEAT") return `/b/${productId}`;
    if (productType === "MERCH") return `/m/${productId}`;
    return `/r/${productId}`;
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center gap-4">
      {status === "LOADING" || status === "PENDING" ? (
        <>
          <p className="text-sm text-ink-3">Confirming your payment…</p>
        </>
      ) : status === "PAID" ? (
        <>
          <h1 className="font-serif text-2xl">It&apos;s yours.</h1>
          <button
            onClick={() => router.push(productHref() ?? "/library")}
            className="rounded-lg bg-red px-5 py-3 text-sm font-semibold text-white"
          >
            Go to release
          </button>
        </>
      ) : (
        <>
          <h1 className="font-serif text-2xl text-red-soft">Payment didn&apos;t go through</h1>
          <button
            onClick={() => router.push(productHref() ?? "/discover")}
            className="rounded-lg border border-line px-5 py-3 text-sm font-semibold"
          >
            Try again
          </button>
        </>
      )}
    </div>
  );
}
