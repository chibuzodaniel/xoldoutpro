"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type Status = "LOADING" | "INITIATED" | "SUCCESSFUL" | "FAILED";

// Checks every few seconds for up to this long, then stops (no endless polling).
const CONFIRMATION_TIMEOUT_MS = 45_000;
const POLL_MS = 3_000;

// The processor sends the fan back here after paying for a catalog
// subscription (lib/subscriptions/payments.ts). The webhook does the work;
// this page waits until it has, keyed by tx_ref (the Payment's processorRef).
export default function SubscriptionCallbackPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const ref = useSearchParams().get("tx_ref");
  const [status, setStatus] = useState<Status>("LOADING");
  const [creator, setCreator] = useState<{ displayName: string; handle: string } | null>(null);
  const [until, setUntil] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    async function poll() {
      const res = await apiFetch(`/api/subscriptions/status?ref=${encodeURIComponent(ref as string)}`).catch(() => null);
      if (cancelled) return;
      if (res?.ok) {
        const data = await res.json();
        setCreator(data.creator);
        setStatus(data.status);
        if (data.currentPeriodEnd) setUntil(data.currentPeriodEnd);
        if (data.status === "SUCCESSFUL" || data.status === "FAILED") return;
      }
      if (Date.now() - startedAt >= CONFIRMATION_TIMEOUT_MS) return setTimedOut(true);
      timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ref]);

  const pending = status === "LOADING" || status === "INITIATED";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      {!ref ? (
        <>
          <h1 className="font-serif text-3xl">Subscription not found</h1>
          <Link href="/library?tab=subscriptions" className="rounded-full bg-red px-6 py-3 text-sm font-bold text-white">
            Your subscriptions
          </Link>
        </>
      ) : pending && !timedOut ? (
        <>
          <LoadingSpinner size="lg" />
          <div>
            <h1 className="mb-1 font-serif text-3xl">Confirming payment</h1>
            <p className="text-sm text-ink-3">Please wait while we confirm your subscription.</p>
          </div>
        </>
      ) : pending ? (
        <>
          <h1 className="font-serif text-3xl">Still processing</h1>
          <p className="max-w-sm text-sm text-ink-3">
            This is taking longer than usual. It will finish in the background — check Your Subscriptions in a minute.
          </p>
          <Link href="/library?tab=subscriptions" className="rounded-full bg-red px-6 py-3 text-sm font-bold text-white">
            Your subscriptions
          </Link>
        </>
      ) : status === "SUCCESSFUL" ? (
        <>
          <h1 className="font-serif text-3xl">You&apos;re subscribed</h1>
          <p className="max-w-sm text-sm text-ink-3">
            Stream every song by {creator?.displayName ?? "this artist"} in full
            {until ? ` until ${new Date(until).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}` : ""}.
          </p>
          <div className="flex gap-3">
            {creator && (
              <Link href={`/u/${creator.handle}`} className="rounded-full bg-red px-6 py-3 text-sm font-bold text-white">
                Open catalog
              </Link>
            )}
            <Link href="/library?tab=subscriptions" className="rounded-full border border-line px-6 py-3 text-sm font-bold">
              Your subscriptions
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1 className="font-serif text-3xl">Payment didn&apos;t go through</h1>
          <p className="text-sm text-ink-3">Nothing was charged. You can try again from the artist&apos;s profile.</p>
          {creator && (
            <Link href={`/u/${creator.handle}`} className="rounded-full bg-red px-6 py-3 text-sm font-bold text-white">
              Back to {creator.displayName}
            </Link>
          )}
        </>
      )}
    </div>
  );
}
