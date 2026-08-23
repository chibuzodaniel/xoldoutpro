"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type NotificationKind = "SALE" | "ORDER_PAID" | "PAYOUT_INITIATED" | "PAYOUT_FAILED" | "REFUND";
type NotificationRow = { id: string; kind: NotificationKind; title: string; body: string; url: string | null; readAt: string | null; createdAt: string };

type Props = { open: boolean; onClose: () => void; onRead: () => void };

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

const KIND_COLOR: Record<NotificationKind, string> = {
  SALE: "bg-green/15 text-green",
  ORDER_PAID: "bg-green/15 text-green",
  PAYOUT_INITIATED: "bg-blue/15 text-blue",
  PAYOUT_FAILED: "bg-red/15 text-red-soft",
  REFUND: "bg-amber/15 text-amber",
};

function KindIcon({ kind }: { kind: NotificationKind }) {
  if (kind === "PAYOUT_FAILED") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "REFUND") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3" strokeLinecap="round" />
        <path d="M18 3v4h-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Bottom sheet, same shell as the rest of the app's sheets. The header bell
// is deliberately transactional-only (sales, orders paid, payouts, refunds)
// — Socials activity has its own separate signal, the unread badge on the
// Socials nav tab (lib/socials/unread.ts), not this list.
export function NotificationsSheet({ open, onClose, onRead }: Props) {
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);

  useEffect(() => {
    if (!open) return;
    apiFetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : { notifications: [] }))
      .then((data) => setNotifications(data.notifications));
    apiFetch("/api/notifications/read", { method: "POST" }).then((res) => {
      if (res.ok) onRead();
    });
  }, [open, onRead]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${
        open ? "bg-black/60" : "pointer-events-none bg-black/0"
      }`}
      onClick={onClose}
      aria-hidden={!open}
    >
      <div
        className={`relative w-full max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-line-soft bg-surface px-4 pt-6 pb-8 transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 h-7 w-7 rounded-full border border-line flex items-center justify-center text-ink-3"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>

        <h1 className="font-serif text-2xl mb-4">Notifications</h1>

        {notifications === null ? (
          <p className="text-sm text-ink-3">Loading…</p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-ink-3">Sales, orders, payouts, and refunds show up here.</p>
        ) : (
          <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {notifications.map((n) => {
              const row = (
                <div className="flex items-start gap-3 py-3">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${KIND_COLOR[n.kind]}`}>
                    <KindIcon kind={n.kind} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{n.title}</p>
                    <p className="text-xs text-ink-3">{n.body}</p>
                  </div>
                  <span className="text-[11px] text-ink-3 shrink-0 pt-1">{timeAgo(n.createdAt)}</span>
                </div>
              );
              return n.url ? (
                <Link key={n.id} href={n.url} onClick={onClose}>
                  {row}
                </Link>
              ) : (
                <div key={n.id}>{row}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
