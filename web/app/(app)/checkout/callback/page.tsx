"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { apiFetch } from "@/lib/api";
import { ReportSheet } from "@/components/trust/ReportSheet";

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

function formatOrderDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const PENDING_STEPS = ["Processing payment…", "Verifying with bank", "Payment confirmation"];

function OrderDetailsCard({ reference, date, method }: { reference: string | null; date: string | null; method: string | null }) {
  if (!reference && !date && !method) return null;
  const rows = [
    reference && { label: "Reference ID", value: reference },
    date && { label: "Date", value: formatOrderDate(date) },
    method && { label: "Method", value: method },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="relative w-full max-w-xs rounded-xl border border-line bg-surface overflow-hidden text-left">
      <span className="absolute left-0 top-0 bottom-0 w-1 bg-red" aria-hidden />
      <div className="flex flex-col divide-y divide-line-soft pl-4">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between py-2.5 pr-4">
            <span className="text-[11px] uppercase tracking-widest text-ink-3">{r.label}</span>
            <span className="text-sm font-semibold">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
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

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 4l9.5 16.5H2.5L12 4z" strokeLinejoin="round" />
      <path d="M12 10v4" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3" strokeLinecap="round" />
      <path d="M18 3v4h-4M6 21v-4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SupportIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 13a8 8 0 0116 0" strokeLinecap="round" />
      <rect x="2.5" y="13" width="4" height="6" rx="1.5" />
      <rect x="17.5" y="13" width="4" height="6" rx="1.5" />
      <path d="M20 19v1a2 2 0 01-2 2h-4" strokeLinecap="round" />
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
  const [reference, setReference] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    async function poll() {
      const res = await apiFetch(`/api/orders/${orderId}`);
      if (!res.ok || cancelled) return;
      const { order, payment, entitlements } = await res.json();
      const item = order.items[0];
      setProductId(item?.product?.id ?? null);
      setProductType(item?.product?.type ?? null);
      setProductTitle(item?.product?.title ?? null);
      setPriceKobo(item?.priceKobo ?? 0);
      setEventId(item?.product?.ticketTier?.eventId ?? null);
      setReference(payment?.reference ?? order.id);
      setPaymentDate(payment?.date ?? order.createdAt);
      setPaymentMethod(payment?.method ?? null);

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
          <span className="relative flex h-16 w-16 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-red/20 blur-xl" aria-hidden />
            <span className="relative h-16 w-16 animate-spin rounded-full border-[3px] border-red/25 border-t-red" aria-hidden />
          </span>

          <div>
            <h1 className="font-serif text-3xl mb-1">Confirming Payment</h1>
            <p className="text-sm text-ink-3">Please wait while we confirm your payment.</p>
          </div>

          {priceKobo > 0 && <p className="font-serif text-3xl font-semibold">{formatNaira(priceKobo)}</p>}

          <OrderDetailsCard reference={reference} date={paymentDate} method={paymentMethod} />

          <div className="w-full max-w-xs rounded-xl border border-line bg-surface p-4 text-left">
            <div className="flex flex-col">
              {PENDING_STEPS.map((step, i) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${i === 0 ? "bg-red" : "bg-line-strong"}`} />
                    {i < PENDING_STEPS.length - 1 && <span className="w-px flex-1 bg-line-soft" style={{ minHeight: 18 }} />}
                  </div>
                  <p className={`text-sm pb-4 ${i === 0 ? "font-semibold text-ink" : "text-ink-3"}`}>{step}</p>
                </div>
              ))}
            </div>
          </div>
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
          <span className="relative flex h-16 w-16 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-red/30 blur-xl" aria-hidden />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-red text-white">
              <XIcon />
            </span>
          </span>

          <div>
            <h1 className="font-serif text-3xl mb-1">Payment Not Successful</h1>
            <p className="text-sm text-ink-3">Something went wrong with your payment.</p>
          </div>

          {priceKobo > 0 && <p className="font-serif text-3xl font-semibold">{formatNaira(priceKobo)}</p>}

          <OrderDetailsCard reference={reference} date={paymentDate} method={paymentMethod} />

          <div className="flex items-start gap-2.5 rounded-lg border border-red/20 bg-red/5 p-3 text-left w-full max-w-xs">
            <span className="text-red-soft shrink-0 mt-0.5">
              <WarningIcon />
            </span>
            <p className="text-xs text-ink-2">Your payment could not be processed. Please try again or use a different method.</p>
          </div>

          <div className="flex flex-col items-center gap-3 w-full max-w-xs mt-1">
            <button
              onClick={() => router.push(productHref() ?? "/discover")}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red px-6 py-3 text-sm font-semibold text-white"
            >
              <RetryIcon />
              Try Again
            </button>
            <button
              onClick={() => setSupportOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-line px-6 py-3 text-sm font-semibold text-ink-2"
            >
              <SupportIcon />
              Contact Support
            </button>
          </div>

          {productId && (
            <ReportSheet
              open={supportOpen}
              onClose={() => setSupportOpen(false)}
              targetType="PRODUCT"
              targetId={productId}
              reasons={[{ value: "BUG", label: "Payment issue" }]}
              title="Contact Support"
              detailsPlaceholder={`Tell us what happened with order ${reference ?? orderId}`}
            />
          )}
        </>
      )}
    </div>
  );
}
