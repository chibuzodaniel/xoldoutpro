"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type Status = "LOADING" | "INITIATED" | "SUCCESSFUL" | "FAILED";
const TIMEOUT_MS = 45_000;
const POLL_MS = 3_000;

// The processor sends the member back here after paying for a community
// membership (lib/communities/payments.ts). The webhook does the work; this
// page checks for a short while, then stops.
export default function CommunityPaymentCallbackPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const ref = useSearchParams().get("tx_ref");
  const [status, setStatus] = useState<Status>("LOADING");
  const [community, setCommunity] = useState<{ id: string; name: string } | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    async function poll() {
      const res = await apiFetch(`/api/communities/payment-status?ref=${encodeURIComponent(ref as string)}`).catch(() => null);
      if (cancelled) return;
      if (res?.ok) {
        const d = await res.json();
        setCommunity(d.community);
        setStatus(d.status);
        if (d.status === "SUCCESSFUL" || d.status === "FAILED") return;
      }
      if (Date.now() - startedAt >= TIMEOUT_MS) return setTimedOut(true);
      timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ref]);

  const pending = status === "LOADING" || status === "INITIATED";
  const open = community && (
    <Link href={`/groups/${community.id}`} className="rounded-full bg-red px-6 py-3 text-sm font-bold text-white">
      Open {community.name}
    </Link>
  );

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      {!ref ? (
        <h1 className="font-serif text-3xl">Payment not found</h1>
      ) : pending && !timedOut ? (
        <>
          <LoadingSpinner size="lg" />
          <div>
            <h1 className="mb-1 font-serif text-3xl">Confirming payment</h1>
            <p className="text-sm text-ink-3">Please wait while we confirm your membership.</p>
          </div>
        </>
      ) : pending ? (
        <>
          <h1 className="font-serif text-3xl">Still processing</h1>
          <p className="max-w-sm text-sm text-ink-3">This is taking longer than usual. It will finish in the background — check the community in a minute.</p>
          {open}
        </>
      ) : status === "SUCCESSFUL" ? (
        <>
          <h1 className="font-serif text-3xl">You&apos;re in</h1>
          <p className="text-sm text-ink-3">Welcome to {community?.name ?? "the community"}.</p>
          {open}
        </>
      ) : (
        <>
          <h1 className="font-serif text-3xl">Payment didn&apos;t go through</h1>
          <p className="text-sm text-ink-3">Nothing was charged. You can try again from the community.</p>
          {open}
        </>
      )}
    </div>
  );
}
