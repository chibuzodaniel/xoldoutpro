"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type OrderStatus = "PENDING" | "PAID" | "REFUNDED" | "FAILED";

type Ticket = {
  checkInCode: string;
  tierName: string;
  eventTitle: string;
  venue: string | null;
  isVirtual: boolean;
  startsAt: string;
};

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function formatNaira(kobo: number) {
  if (kobo === 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
  const [productTitle, setProductTitle] = useState<string | null>(null);
  const [priceKobo, setPriceKobo] = useState(0);
  const [eventId, setEventId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    async function poll() {
      const res = await apiFetch(`/api/orders/${orderId}`);
      if (!res.ok || cancelled) return;
      const { order, entitlements } = await res.json();
      const item = order.items[0];
      setProductId(item?.product?.id ?? null);
      setProductType(item?.product?.type ?? null);
      setProductTitle(item?.product?.title ?? null);
      setPriceKobo(item?.priceKobo ?? 0);
      setEventId(item?.product?.ticketTier?.eventId ?? null);

      // The buyer's actual scannable ticket — shown right here instead of
      // making them click through to the event page to find it.
      const ticketEntitlement = (entitlements ?? []).find(
        (e: { product: { type: string }; checkIn: { code: string } | null }) => e.product.type === "EVENT" && e.checkIn,
      );
      if (ticketEntitlement) {
        const tier = ticketEntitlement.product.ticketTier;
        setTicket({
          checkInCode: ticketEntitlement.checkIn.code,
          tierName: tier.name,
          eventTitle: tier.event.title,
          venue: tier.event.venue,
          isVirtual: tier.event.isVirtual,
          startsAt: tier.event.startsAt,
        });
      }

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

  useEffect(() => {
    if (!ticket) return;
    QRCode.toDataURL(ticket.checkInCode, { margin: 1, width: 240 }).then(setQrDataUrl);
  }, [ticket]);

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
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center gap-5">
      {status === "LOADING" || status === "PENDING" ? (
        <>
          <LoadingSpinner size="lg" />
          <p className="text-sm text-ink-3">Confirming your payment…</p>
        </>
      ) : status === "PAID" ? (
        <>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green/15 text-green">
            <CheckIcon />
          </span>

          <div>
            <h1 className="font-serif text-3xl mb-1">It&apos;s yours.</h1>
            {productTitle && (
              <p className="text-sm text-ink-3">
                {productTitle} · {formatNaira(priceKobo)}
              </p>
            )}
          </div>

          {ticket ? (
            <div className="relative w-full max-w-xs rounded-2xl border border-line bg-surface text-left overflow-hidden shadow-[0_0_0_1px_rgba(225,29,72,0.08)]">
              <div className="p-5 pb-4 text-center">
                {qrDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt="Ticket QR code" className="mx-auto h-40 w-40 rounded-lg bg-white p-2" />
                )}
              </div>
              <div className="relative border-t border-dashed border-line-strong px-5 pt-4 pb-5">
                <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-bg" aria-hidden />
                <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-bg" aria-hidden />
                <p className="text-sm font-semibold mb-0.5">{ticket.eventTitle}</p>
                <p className="text-xs text-ink-3 mb-0.5">{ticket.tierName} ticket</p>
                <p className="text-xs text-ink-3 mb-3">
                  {formatEventDate(ticket.startsAt)} · {ticket.isVirtual ? "Virtual" : (ticket.venue ?? "Venue TBA")}
                </p>
                <p className="text-[12px] uppercase tracking-widest text-red-soft font-semibold text-center">
                  Show this QR code at the door
                </p>
              </div>
            </div>
          ) : (
            productTitle && (
              <div className="w-full max-w-xs rounded-2xl border border-line bg-surface p-5 text-left">
                <p className="text-[11px] uppercase tracking-widest text-ink-3 mb-1">Order</p>
                <p className="text-sm font-semibold mb-3">{productTitle}</p>
                <div className="flex items-center justify-between text-xs text-ink-3 border-t border-line-soft pt-3">
                  <span>Total paid</span>
                  <span className="text-ink font-semibold">{formatNaira(priceKobo)}</span>
                </div>
              </div>
            )
          )}

          <p className="flex items-center gap-1.5 text-xs text-ink-3">
            <MailIcon />A confirmation email is on its way too.
          </p>

          <div className="flex flex-col items-center gap-3 mt-1">
            <button
              onClick={() => router.push(productHref() ?? "/library")}
              className="rounded-lg bg-red px-6 py-3 text-sm font-semibold text-white"
            >
              {ticket ? "Go to event" : "Go to release"}
            </button>
            <button onClick={() => router.push("/discover")} className="text-xs text-ink-3 font-semibold">
              Keep browsing
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red/15 text-red-soft">
            <XIcon />
          </span>
          <div>
            <h1 className="font-serif text-3xl mb-1">Payment didn&apos;t go through</h1>
            <p className="text-sm text-ink-3">You haven&apos;t been charged. No harm done — try again whenever you&apos;re ready.</p>
          </div>
          <div className="flex flex-col items-center gap-3 mt-1">
            <button
              onClick={() => router.push(productHref() ?? "/discover")}
              className="rounded-lg bg-red px-6 py-3 text-sm font-semibold text-white"
            >
              Try again
            </button>
            <button onClick={() => router.push("/discover")} className="text-xs text-ink-3 font-semibold">
              Back to Discover
            </button>
          </div>
        </>
      )}
    </div>
  );
}
