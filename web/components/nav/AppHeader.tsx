"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { NotificationsSheet } from "@/components/notifications/NotificationsSheet";

export function AppHeader() {
  const { appUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // One-time fetch on mount, just to size the bell's badge — the sheet
  // itself refetches the full list (and marks it read) when opened.
  useEffect(() => {
    if (!appUser) return;
    apiFetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setUnreadCount(data.unreadCount);
      });
  }, [appUser]);

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-bg/95 backdrop-blur border-b border-line-soft">
      <Link href="/discover" className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/xoldout-icon-transparent.png" alt="" className="h-6 w-6" />
        <span className="font-sans font-extrabold tracking-tight text-[16px]">XOLDOUT</span>
      </Link>
      <div className="flex items-center gap-4">
        <Link href="/search" aria-label="Search" className="text-ink-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4.3-4.3" strokeLinecap="round" />
          </svg>
        </Link>
        <button type="button" onClick={() => setOpen(true)} aria-label="Notifications" className="relative text-ink-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path d="M18 8a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 20a2 2 0 004 0" strokeLinecap="round" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red px-1 text-[9px] font-bold leading-none text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </div>
      <NotificationsSheet open={open} onClose={() => setOpen(false)} onRead={() => setUnreadCount(0)} />
    </header>
  );
}
