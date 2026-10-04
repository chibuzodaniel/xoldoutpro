"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type NotificationKind =
  | "SALE"
  | "ORDER_PAID"
  | "PAYOUT_INITIATED"
  | "PAYOUT_FAILED"
  | "PAYOUT_PAID"
  | "REFUND"
  | "MODERATION"
  | "FOLLOW"
  | "LIKE"
  | "COMMENT"
  | "FANBASE"
  | "REMINDER"
  | "VERIFICATION"
  | "LIVE";
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

function fullDate(iso: string) {
  return new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const KIND_LABEL: Record<NotificationKind, string> = {
  SALE: "Sale",
  ORDER_PAID: "Order confirmed",
  PAYOUT_INITIATED: "Withdrawal started",
  PAYOUT_PAID: "Withdrawal sent",
  PAYOUT_FAILED: "Withdrawal failed",
  REFUND: "Refund",
  MODERATION: "Needs moderator attention",
  FOLLOW: "New follower",
  LIKE: "Like",
  COMMENT: "Comment",
  FANBASE: "Fanbase",
  REMINDER: "Reminder",
  VERIFICATION: "Verification",
  LIVE: "Live",
};

const KIND_COLOR: Record<NotificationKind, string> = {
  SALE: "bg-green/15 text-green",
  ORDER_PAID: "bg-green/15 text-green",
  PAYOUT_INITIATED: "bg-blue/15 text-blue",
  PAYOUT_PAID: "bg-green/15 text-green",
  PAYOUT_FAILED: "bg-red/15 text-red-soft",
  REFUND: "bg-amber/15 text-amber",
  MODERATION: "bg-red/15 text-red-soft",
  FOLLOW: "bg-blue/15 text-blue",
  LIKE: "bg-red/15 text-red-soft",
  COMMENT: "bg-blue/15 text-blue",
  FANBASE: "bg-amber/15 text-amber",
  REMINDER: "bg-amber/15 text-amber",
  VERIFICATION: "bg-green/15 text-green",
  LIVE: "bg-red/15 text-red-soft",
};

function KindIcon({ kind }: { kind: NotificationKind }) {
  if (kind === "MODERATION") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" />
        <path d="M12 8v4M12 15.5h.01" />
      </svg>
    );
  }
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

// Explicit ask, 2026-10-04: notifications that are "the same" — same kind
// and same title, e.g. five "New like"s — merge into one row with a count;
// tapping it expands the individual notifications, and tapping one of those
// goes straight to that notification's own page. Groups are ordered by their
// newest notification; a group of one renders exactly as before.
type NotificationGroup = { key: string; items: NotificationRow[] };

function groupNotifications(rows: NotificationRow[]): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  for (const n of rows) {
    const key = `${n.kind}|${n.title}`;
    const group = groups.get(key);
    if (group) group.items.push(n);
    else groups.set(key, { key, items: [n] });
  }
  // rows arrive newest-first, so Map insertion order is already "by newest item".
  return [...groups.values()];
}

// Bottom sheet, same shell as the rest of the app's sheets. The header bell
// is deliberately transactional-only (sales, orders paid, payouts, refunds)
// — Socials activity has its own separate signal, the unread badge on the
// Socials nav tab (lib/socials/unread.ts), not this list.
export function NotificationsSheet({ open, onClose, onRead }: Props) {
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [selected, setSelected] = useState<NotificationRow | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const router = useRouter();

  function toggleGroup(key: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Explicit ask, 2026-10-04: a notification only counts as checked once
  // the user actually opens it (its detail, or its page) — not just because
  // the bell was opened. Updated locally at once so it dims immediately;
  // onRead refreshes the header badge once the server has it.
  function markRead(ids: string[] | null) {
    const now = new Date().toISOString();
    const pending = (notifications ?? []).filter((n) => !n.readAt && (ids === null || ids.includes(n.id)));
    if (pending.length === 0) return;
    setNotifications((cur) => cur?.map((n) => (pending.some((p) => p.id === n.id) ? { ...n, readAt: now } : n)) ?? null);
    apiFetch("/api/notifications/read", {
      method: "POST",
      body: JSON.stringify(ids === null ? {} : { ids: pending.map((n) => n.id) }),
    }).then((res) => {
      if (res.ok) onRead();
    });
  }

  function openDetail(n: NotificationRow) {
    markRead([n.id]);
    setSelected(n);
  }

  // A merged notification's own row: straight to its page when it has one.
  function openItem(n: NotificationRow) {
    markRead([n.id]);
    if (n.url) {
      onClose();
      router.push(n.url);
    } else {
      setSelected(n);
    }
  }

  useEffect(() => {
    function closeDetail() {
      setSelected(null);
      setExpanded(new Set());
    }
    if (!open) {
      closeDetail();
      return;
    }
    apiFetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : { notifications: [] }))
      .then((data) => setNotifications(data.notifications));
  }, [open]);

  const unreadTotal = notifications?.filter((n) => !n.readAt).length ?? 0;

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

        <div className="mb-4 flex items-end justify-between gap-3 pr-10">
          <h1 className="font-serif text-2xl">Notifications</h1>
          {unreadTotal > 0 && (
            <button type="button" onClick={() => markRead(null)} className="pb-1 text-xs font-semibold text-red-soft">
              Mark all as read
            </button>
          )}
        </div>

        {notifications === null ? (
          <p className="text-sm text-ink-3">Loading…</p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-ink-3">Sales, orders, payouts, and refunds show up here.</p>
        ) : (
          <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {groupNotifications(notifications).map(({ key, items }) => {
              const n = items[0];
              const unreadInGroup = items.filter((i) => !i.readAt).length;
              const isUnread = unreadInGroup > 0;
              // Unread: tinted row, red dot, bold white title. Checked: dimmed.
              const rowTone = isUnread ? "bg-red/[0.06]" : "opacity-60";
              const titleTone = isUnread ? "font-semibold text-ink" : "font-medium text-ink-2";
              const dot = (
                <span className={`mt-3 h-2 w-2 shrink-0 rounded-full ${isUnread ? "bg-red" : "bg-transparent"}`} aria-hidden />
              );

              if (items.length === 1) {
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => openDetail(n)}
                    className={`-mx-4 flex items-start gap-2.5 px-4 py-3 text-left ${rowTone}`}
                  >
                    {dot}
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${KIND_COLOR[n.kind]}`}>
                      <KindIcon kind={n.kind} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${titleTone}`}>{n.title}</p>
                      <p className="text-xs text-ink-3">{n.body}</p>
                    </div>
                    <span className="text-[11px] text-ink-3 shrink-0 pt-1">{timeAgo(n.createdAt)}</span>
                    <span className="sr-only">{isUnread ? "Unread" : "Read"}</span>
                  </button>
                );
              }
              const isOpen = expanded.has(key);
              return (
                <div key={key} className={`-mx-4 px-4 ${isUnread ? "bg-red/[0.06]" : ""}`}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(key)}
                    aria-expanded={isOpen}
                    className={`flex w-full items-start gap-2.5 py-3 text-left ${isUnread ? "" : "opacity-60"}`}
                  >
                    {dot}
                    <span className={`relative flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${KIND_COLOR[n.kind]}`}>
                      <KindIcon kind={n.kind} />
                      <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-red px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                        {items.length}
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${titleTone}`}>{n.title}</p>
                      <p className="text-xs text-ink-3">
                        {n.body}
                        <span className="text-ink-2">
                          {" "}
                          · +{items.length - 1} more{isUnread && ` · ${unreadInGroup} new`}
                        </span>
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5 pt-1 text-[11px] text-ink-3">
                      {timeAgo(n.createdAt)}
                      <svg
                        viewBox="0 0 24 24"
                        className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="mb-2 ml-[3.25rem] flex flex-col divide-y divide-line-soft border-l border-line-soft">
                      {items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openItem(item)}
                          className={`flex items-start gap-2 py-2.5 pl-3 text-left hover:bg-surface-2 ${item.readAt ? "opacity-60" : ""}`}
                        >
                          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-red"}`} aria-hidden />
                          <p className={`min-w-0 flex-1 text-xs ${item.readAt ? "text-ink-3" : "font-medium text-ink"}`}>{item.body}</p>
                          <span className="shrink-0 text-[11px] text-ink-3">{timeAgo(item.createdAt)}</span>
                          {item.url && <span className="shrink-0 text-ink-3">›</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <NotificationDetailSheet notification={selected} onClose={() => setSelected(null)} onNavigate={onClose} />
    </div>
  );
}

// Layered on top of the notifications list (same fixed-inset-0 + slide-up
// pattern as PayoutDetailSheet in wallet/page.tsx) — every notification is
// clickable now, not just ones with a url, since there was previously no way
// to see a notification's full body/timestamp without it also being a link.
function NotificationDetailSheet({
  notification,
  onClose,
  onNavigate,
}: {
  notification: NotificationRow | null;
  onClose: () => void;
  onNavigate: () => void;
}) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${
        notification ? "bg-black/60" : "pointer-events-none bg-black/0"
      }`}
      // stopPropagation: this backdrop is nested inside NotificationsSheet's
      // own backdrop div (both are fixed inset-0), so without this, tapping
      // outside the detail panel to dismiss it would bubble up and also
      // close the notifications list underneath via that div's own onClose.
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      aria-hidden={!notification}
    >
      <div
        className={`relative w-full rounded-t-2xl border-t border-line-soft bg-surface px-4 pt-6 pb-8 transition-transform duration-300 ease-out ${
          notification ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {notification && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <span className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${KIND_COLOR[notification.kind]}`}>
                <KindIcon kind={notification.kind} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-widest text-ink-3">{KIND_LABEL[notification.kind]}</p>
                <p className="text-[12px] text-ink-3">{fullDate(notification.createdAt)}</p>
              </div>
            </div>

            <h1 className="font-serif text-xl mb-2">{notification.title}</h1>
            <p className="text-sm text-ink-2 mb-6">{notification.body}</p>

            <div className="flex flex-col gap-2">
              {notification.url && (
                <Link
                  href={notification.url}
                  onClick={onNavigate}
                  className="block w-full text-center rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white"
                >
                  View
                </Link>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-lg border border-line py-3 text-sm font-semibold text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
