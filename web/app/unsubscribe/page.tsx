"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

// Top-level route, no bottom nav/app shell (matches /onboarding) — reached
// from an email client, not the app, by a visitor who may well be signed
// out. Plain fetch(), not apiFetch(): there's no Firebase session to attach
// a bearer token from, and the unsubscribe token itself is the credential.
export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribeInner />
    </Suspense>
  );
}

function UnsubscribeInner() {
  const token = useSearchParams().get("token");
  const [status, setStatus] = useState<"pending" | "done" | "error">("pending");

  useEffect(() => {
    async function run() {
      if (!token) {
        setStatus("error");
        return;
      }
      try {
        const res = await fetch("/api/email/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        setStatus(res.ok ? "done" : "error");
      } catch {
        setStatus("error");
      }
    }
    run();
  }, [token]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/xoldout-logo-transparent.png" alt="XOLDOUT" className="h-10 w-auto mb-8 mx-auto" />
        {status === "pending" && <p className="text-sm text-ink-3">Unsubscribing…</p>}
        {status === "done" && (
          <>
            <h1 className="font-serif text-2xl mb-2">You&apos;re unsubscribed</h1>
            <p className="text-sm text-ink-3">You won&apos;t get digest emails from XOLDOUT anymore. You can re-subscribe anytime from Edit Profile.</p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="font-serif text-2xl mb-2">That link didn&apos;t work</h1>
            <p className="text-sm text-ink-3">This unsubscribe link is invalid or has already been used.</p>
          </>
        )}
      </div>
    </main>
  );
}
