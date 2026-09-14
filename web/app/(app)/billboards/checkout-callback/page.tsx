"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type BillboardStatus = "PENDING_PAYMENT" | "ACTIVE" | "REMOVED";

const CONFIRMATION_TIMEOUT_MS = 45_000;

// Bachs redirects here after a Billboard checkout (lib/commerce/billboards.ts's
// createBillboardCheckout) — much smaller sibling of
// app/(app)/checkout/callback/page.tsx: no tickets/QR/order-detail-card,
// just poll GET /api/billboards/[id] until the webhook has caught up.
export default function BillboardCheckoutCallbackPage() {
  return (
    <Suspense fallback={null}>
      <BillboardCheckoutCallbackInner />
    </Suspense>
  );
}

function BillboardCheckoutCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const billboardId = searchParams.get("tx_ref");
  const [status, setStatus] = useState<BillboardStatus | "LOADING">("LOADING");
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!billboardId) return;
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) setTimedOut(true);
    }, CONFIRMATION_TIMEOUT_MS);

    async function poll() {
      const res = await apiFetch(`/api/billboards/${billboardId}`);
      if (!res.ok || cancelled) return;
      const { billboard } = await res.json();
      if (billboard.status === "ACTIVE" || billboard.status === "REMOVED") {
        setStatus(billboard.status);
        return;
      }
      setTimeout(poll, 1500);
    }
    poll();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [billboardId]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center gap-5">
      {!billboardId ? (
        <>
          <h1 className="font-serif text-3xl mb-1">Billboard not found</h1>
          <p className="text-sm text-ink-3">We couldn&apos;t find a billboard purchase to confirm.</p>
          <button onClick={() => router.push("/billboards")} className="rounded-lg bg-red px-6 py-3 text-sm font-semibold text-white">
            Back to Billboards
          </button>
        </>
      ) : (status === "LOADING" || status === "PENDING_PAYMENT") && !timedOut ? (
        <>
          <LoadingSpinner size="lg" />
          <div>
            <h1 className="font-serif text-3xl mb-1">Confirming Payment</h1>
            <p className="text-sm text-ink-3">Please wait while we confirm your payment.</p>
          </div>
        </>
      ) : status === "LOADING" || status === "PENDING_PAYMENT" ? (
        <>
          <LoadingSpinner size="lg" />
          <div>
            <h1 className="font-serif text-3xl mb-1">Still processing</h1>
            <p className="text-sm text-ink-3">
              This is taking longer than usual. It&apos;ll finish confirming in the background — you don&apos;t need to stay on
              this page.
            </p>
          </div>
          <button onClick={() => router.push("/billboards")} className="rounded-lg bg-red px-6 py-3 text-sm font-semibold text-white">
            Check status
          </button>
        </>
      ) : status === "ACTIVE" ? (
        <>
          <div>
            <h1 className="font-serif text-3xl mb-1">Your billboard is live.</h1>
            <p className="text-sm text-ink-3">It&apos;s now showing in the Discover rail.</p>
          </div>
          <div className="flex flex-col items-center gap-3 mt-1">
            <button onClick={() => router.push("/discover")} className="rounded-lg bg-red px-6 py-3 text-sm font-semibold text-white">
              View on Discover
            </button>
            <button onClick={() => router.push("/billboards")} className="text-xs text-ink-3 font-semibold">
              Manage billboard
            </button>
          </div>
        </>
      ) : (
        <>
          <div>
            <h1 className="font-serif text-3xl mb-1">Payment Not Successful</h1>
            <p className="text-sm text-ink-3">Your billboard payment could not be processed. Please try again.</p>
          </div>
          <button onClick={() => router.push("/billboards")} className="rounded-lg bg-red px-6 py-3 text-sm font-semibold text-white">
            Try Again
          </button>
        </>
      )}
    </div>
  );
}
