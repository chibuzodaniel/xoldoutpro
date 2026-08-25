"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { PublishSheet } from "./PublishSheet";

const UNREAD_POLL_MS = 45000;

const ICONS: Record<string, React.ReactNode> = {
  discover: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" strokeLinejoin="round" />
    </svg>
  ),
  socials: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5" />
      <path d="M17 8.5a3 3 0 010 5" strokeLinecap="round" />
    </svg>
  ),
  library: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 6h9M4 11h9M4 16h5" strokeLinecap="round" />
      <circle cx="18" cy="15.5" r="2.6" />
      <path d="M20.6 15.5V7" strokeLinecap="round" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0115 0" strokeLinecap="round" />
    </svg>
  ),
};

const ITEMS: { href: string; label: string; icon: keyof typeof ICONS; isFab: boolean }[] = [
  { href: "/discover", label: "Discover", icon: "discover", isFab: false },
  { href: "/socials", label: "Socials", icon: "socials", isFab: false },
  { href: "/publish", label: "", icon: "discover", isFab: true },
  { href: "/library", label: "Library", icon: "library", isFab: false },
  { href: "/profile", label: "Profile", icon: "profile", isFab: false },
];

// Rendered globally from the root layout (so it survives navigation
// alongside the mini player) but only makes sense on the app-shell surfaces
// it was designed for — hide it on auth/onboarding and public profile pages,
// which have never had it and aren't part of the five-tab navigation model.
const NO_NAV_EXACT = new Set(["/login", "/signup", "/onboarding", "/unsubscribe"]);

function hasBottomNav(pathname: string) {
  if (NO_NAV_EXACT.has(pathname)) return false;
  if (pathname.startsWith("/u/")) return false;
  // A Fanbase group's own chat view (not the /groups list) is a full-height
  // ChatComposer-driven surface, same shape as the reasoning above for /u/ —
  // with the tab bar also in the flex column, opening the keyboard pushed
  // both it and ChatComposer up together (root layout's h-dvh reflow),
  // stacking two bars directly above the keyboard instead of leaving the
  // composer alone right above it.
  if (pathname.startsWith("/groups/")) return false;
  return true;
}

export function BottomNav() {
  const pathname = usePathname();
  const { appUser } = useAuth();
  const [publishOpen, setPublishOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // On Socials, the central FAB creates a feed post instead of opening the
  // general "what are you publishing" sheet — it hands off via a query param
  // since this component has no access to the Socials page's post list state.
  const onSocials = pathname?.startsWith("/socials");

  // Polls the in-app unread badge (separate signal from push — see
  // lib/socials/unread.ts) while elsewhere in the app; skipped while
  // actually on Socials since that's handled by the mark-read effect below.
  useEffect(() => {
    if (!appUser || onSocials) return;
    let cancelled = false;
    function poll() {
      apiFetch("/api/socials/unread")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && !cancelled) setUnreadCount(data.count);
        });
    }
    poll();
    const interval = setInterval(poll, UNREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [appUser, onSocials]);

  // Opening Socials zeroes the badge immediately by advancing the
  // "last seen" watermark, rather than waiting for the next poll.
  useEffect(() => {
    if (!appUser || !onSocials) return;
    apiFetch("/api/socials/unread", { method: "POST" }).then((res) => {
      if (res.ok) setUnreadCount(0);
    });
  }, [appUser, onSocials]);

  if (!hasBottomNav(pathname ?? "")) return null;

  return (
    <>
      <nav className="sticky bottom-0 z-20 flex items-center justify-around border-t border-line bg-bg/95 backdrop-blur px-2 py-2">
        {ITEMS.map((item) =>
          item.isFab ? (
            onSocials ? (
              <Link
                key={item.href}
                href="/socials?compose=1"
                className="-mt-6 flex h-11 w-11 items-center justify-center rounded-full bg-red text-white shadow-lg shadow-red/30"
                aria-label="New post"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]">
                  <path d="M4 20l.9-4.5a2 2 0 01.55-1.03L16.6 3.32a1.6 1.6 0 012.26 0l1.82 1.82a1.6 1.6 0 010 2.26L9.53 18.55a2 2 0 01-1.03.55L4 20z" strokeLinejoin="round" />
                  <path d="M14.5 5.5l4 4" strokeLinecap="round" />
                </svg>
              </Link>
            ) : (
              <button
                key={item.href}
                type="button"
                onClick={() => setPublishOpen(true)}
                className="-mt-6 flex h-11 w-11 items-center justify-center rounded-full bg-red text-white shadow-lg shadow-red/30"
                aria-label="Publish"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[18px] w-[18px]">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </button>
            )
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-3 py-1 text-[11px] ${
                pathname?.startsWith(item.href) ? "text-white" : "text-ink-3"
              }`}
            >
              <span className="relative h-[19px] w-[19px]">
                {ICONS[item.icon]}
                {item.icon === "socials" && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red px-1 text-[9px] font-bold leading-none text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
              {item.label}
            </Link>
          ),
        )}
      </nav>
      <PublishSheet open={publishOpen} onClose={() => setPublishOpen(false)} />
    </>
  );
}
