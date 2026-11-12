"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import type { SupportAccount } from "@/lib/support/account";

// "Message XOLDOUT" card (explicit ask, 2026-11-11): the verified official
// account, pinned for every user, opening a direct message for complaints.
let cached: Promise<SupportAccount | null> | null = null;
function fetchSupport() {
  cached ??= fetch("/api/support")
    .then((r) => (r.ok ? r.json() : { account: null }))
    .then((d) => d.account as SupportAccount | null)
    .catch(() => null);
  return cached;
}

export function ContactXoldout({ className = "" }: { className?: string }) {
  const { appUser } = useAuth();
  const [account, setAccount] = useState<SupportAccount | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSupport().then((a) => alive && setAccount(a));
    return () => {
      alive = false;
    };
  }, []);
  if (!account || appUser?.id === account.id) return null;

  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-red/30 bg-red/10 px-4 py-3 ${className}`}>
      <Link href="/support" className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black ring-1 ring-red">
        {/* eslint-disable-next-line @next/next/no-img-element -- static logo */}
        <img src="/xoldout-icon-transparent.png" alt="" className="h-7 w-7" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[15px] font-bold">
          XOLDOUT
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-red-soft" fill="currentColor" aria-label="Verified">
            <path d="M12 2l2.4 2.1 3.2-.4.9 3.1 2.8 1.6-1.1 3 1.1 3-2.8 1.6-.9 3.1-3.2-.4L12 22l-2.4-2.1-3.2.4-.9-3.1-2.8-1.6 1.1-3-1.1-3 2.8-1.6.9-3.1 3.2.4z" />
            <path d="M8.5 12.2l2.3 2.3 4.7-4.8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </p>
        <p className="truncate text-[12px] text-ink-2">Official channel · report issues, complaints or ideas</p>
      </div>
      {/* Opens the XOLDOUT channel (2026-11-12) instead of a direct message. */}
      <Link href={appUser ? "/support" : "/login"} className="shrink-0 rounded-full bg-red px-4 py-2 text-[13px] font-bold text-white">
        Open
      </Link>
    </div>
  );
}
