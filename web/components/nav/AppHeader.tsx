"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { NotificationsSheet } from "@/components/notifications/NotificationsSheet";
import { CartIconLink } from "@/components/nav/CartIconLink";

export function AppHeader() {
  const { appUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  // Direct messages badge: conversations with unread messages + requests.
  const [dmCount, setDmCount] = useState(0);

  // Sizes the bell's badge on mount, and again whenever a push arrives while
  // the app is open (components/push/PushAutoEnroll fires this event) or the
  // tab comes back into view, or the sheet marks notifications read (each
  // one as it is opened, or "Mark all as read") — the sheet itself refetches
  // the full list when opened.
  useEffect(() => {
    if (!appUser) return;
    const refresh = () => {
      apiFetch("/api/notifications")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setUnreadCount(data.unreadCount);
        })
        .catch(() => {});
      apiFetch("/api/messages/unread")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setDmCount(data.unreadConversations + data.requests);
        })
        .catch(() => {});
    };
    // The in-app message banner's poll carries the DM badge numbers — no
    // second poll here (Vercel CPU, 2026-10-06).
    const onDmUnread = (e: Event) => setDmCount((e as CustomEvent<number>).detail);
    window.addEventListener("xoldout:dm-unread", onDmUnread);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener("xoldout:notifications-changed", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("xoldout:notifications-changed", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("xoldout:dm-unread", onDmUnread);
    };
  }, [appUser]);

  return (
    <>
      {/* v2 look (design/v2-prototype): roomier bar, larger mark and icons.
          The logo itself is unchanged (explicit ask, 2026-11-09). */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3.5 bg-bg/95 backdrop-blur border-b border-line-soft">
        <Link href="/discover" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/xoldout-icon-transparent.png" alt="" className="h-7 w-7" />
          <span className="font-sans font-extrabold tracking-tight text-[18px]">XOLDOUT</span>
        </Link>
        <div className="flex items-center gap-5">
          <Link href="/search" aria-label="Search" className="text-ink-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[22px] w-[22px]">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4.3-4.3" strokeLinecap="round" />
            </svg>
          </Link>
          <CartIconLink />
          {appUser && (
            <Link href="/messages" aria-label="Messages" className="relative text-ink-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[22px] w-[22px]">
                <path d="M4 5h16v11H8l-4 3.5V5z" strokeLinejoin="round" />
              </svg>
              {dmCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red px-1 text-[9px] font-bold leading-none text-white">
                  {dmCount > 9 ? "9+" : dmCount}
                </span>
              )}
            </Link>
          )}
          <button type="button" onClick={() => setOpen(true)} aria-label="Notifications" className="relative text-ink-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[22px] w-[22px]">
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
      </header>
      <NotificationsSheet open={open} onClose={() => setOpen(false)} onRead={() => window.dispatchEvent(new Event("xoldout:notifications-changed"))} />
    </>
  );
}
