"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type TopUpStatus = "INITIATED" | "SUCCESSFUL" | "FAILED";

const CONFIRMATION_TIMEOUT_MS = 45_000;

// Bachs redirects here after an XG top-up checkout (lib/live/coins.ts's
// createCoinTopUpCheckout) — same "poll until the webhook has caught up"
// shape as app/(app)/billboards/checkout-callback/page.tsx, keyed by
// tx_ref (the Payment's own processorRef, not an entity id — see
// GET /api/coins/topup/status).
export default function CoinTopUpCheckoutCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CoinTopUpCheckoutCallbackInner />
    </Suspense>
  );
}

function CoinTopUpCheckoutCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get("tx_ref");
  const [status, setStatus] = useState<TopUpStatus | "LOADING">("LOADING");
  const [xgAmount, setXgAmount] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) setTimedOut(true);
    }, CONFIRMATION_TIMEOUT_MS);

    async function poll() {
      const res = await apiFetch(`/api/coins/topup/status?ref=${encodeURIComponent(ref as string)}`);
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (data.status === "SUCCESSFUL" || data.status === "FAILED") {
        setStatus(data.status);
        setXgAmount(data.xgAmount);
        return;
      }
      setTimeout(poll, 1500);
    }
    poll();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [ref]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center gap-5">
      {!ref ? (
        <>
          <h1 className="font-serif text-3xl mb-1">Top-up not found</h1>
          <p className="text-sm text-ink-3">We couldn&apos;t find a top-up to confirm.</p>
          <button onClick={() => router.push("/live")} className="rounded-lg bg-red px-6 py-3 text-sm font-semibold text-white">
            Back to Live
          </button>
        </>
      ) : (status === "LOADING" || status === "INITIATED") && !timedOut ? (
        <>
          <LoadingSpinner size="lg" />
          <div>
            <h1 className="font-serif text-3xl mb-1">Confirming Payment</h1>
            <p className="text-sm text-ink-3">Please wait while we confirm your payment.</p>
          </div>
        </>
      ) : status === "LOADING" || status === "INITIATED" ? (
        <>
          <LoadingSpinner size="lg" />
          <div>
            <h1 className="font-serif text-3xl mb-1">Still processing</h1>
            <p className="text-sm text-ink-3">
              This is taking longer than usual. It&apos;ll finish confirming in the background — you don&apos;t need to stay on
              this page.
            </p>
          </div>
        </>
      ) : status === "SUCCESSFUL" ? (
        <>
          <div>
            <h1 className="font-serif text-3xl mb-1">{xgAmount?.toLocaleString("en-NG") ?? ""} XG added</h1>
            <p className="text-sm text-ink-3">Your balance is ready to spend on gifts, paid Lives, and requests.</p>
          </div>
          <button onClick={() => router.push("/live")} className="rounded-lg bg-red px-6 py-3 text-sm font-semibold text-white">
            Back to Live
          </button>
        </>
      ) : (
        <>
          <div>
            <h1 className="font-serif text-3xl mb-1">Payment Not Successful</h1>
            <p className="text-sm text-ink-3">Your top-up could not be processed. Please try again.</p>
          </div>
          <button onClick={() => router.push("/live")} className="rounded-lg bg-red px-6 py-3 text-sm font-semibold text-white">
            Try Again
          </button>
        </>
      )}
    </div>
  );
}
