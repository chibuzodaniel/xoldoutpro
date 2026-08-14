"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";

type Stats = { fans: number; sales: number; catalog: { music: number; beats: number; events: number; merch: number } };

const CATALOG_ROWS = [
  {
    key: "music",
    label: "Music releases",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="7" cy="18" r="3" />
        <path d="M10 18V5l10-2v13" />
        <circle cx="17" cy="16" r="3" />
      </svg>
    ),
  },
  {
    key: "beats",
    label: "Beats & packs",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M5 4v16M12 4v16M19 4v16" />
      </svg>
    ),
  },
  {
    key: "events",
    label: "Events",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="7" width="18" height="11" rx="2" />
        <path d="M8 7v11M16 7v11" />
      </svg>
    ),
  },
  {
    key: "merch",
    label: "Merchandise",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 8h16l-1.2 11H5.2z" />
        <path d="M9 8V6a3 3 0 016 0v2" />
      </svg>
    ),
  },
] as const;

export default function ProfilePage() {
  const { appUser } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!appUser) return;
    apiFetch("/api/me/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats);
  }, [appUser]);

  if (!appUser) return null;

  return (
    <div className="pb-8">
      <div
        className="h-28 bg-surface-2 bg-cover bg-center"
        style={appUser.coverUrl ? { backgroundImage: `url(${appUser.coverUrl})` } : undefined}
      />
      <div className="px-4 -mt-9">
        <div className="flex items-end justify-between mb-3">
          <Link href="/profile/edit" className="relative">
            <div className="h-[72px] w-[72px] rounded-full border-2 border-bg bg-surface-2 overflow-hidden flex items-center justify-center">
              {appUser.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={appUser.avatarUrl} alt={appUser.displayName} className="h-full w-full object-cover" />
              ) : (
                <span className="font-serif text-xl text-ink-3">{appUser.displayName.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <span className="absolute bottom-0 right-0 h-5 w-5 rounded-full bg-red border-2 border-bg flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 stroke-white" fill="none" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/analytics"
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                <path d="M3 17l6-6 4 4 7-8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Insights
            </Link>
            <span className="h-8 w-8 rounded-lg border border-line flex items-center justify-center text-ink-2" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
                <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
              </svg>
            </span>
            <Link
              href="/profile/edit"
              className="h-8 w-8 rounded-lg border border-line flex items-center justify-center text-ink-2"
              aria-label="Settings"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.2a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.2a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.2a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1h.2a2 2 0 110 4h-.2a1.6 1.6 0 00-1.5 1z" />
              </svg>
            </Link>
          </div>
        </div>

        <h1 className="font-serif text-xl">{appUser.displayName}</h1>
        <p className="text-sm text-ink-3 mb-4">@{appUser.handle}</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl border border-line bg-surface px-4 py-3 text-center">
            <p className="font-serif text-2xl">{stats?.fans ?? "—"}</p>
            <p className="text-[10px] uppercase tracking-widest text-ink-3 mt-0.5">Fans</p>
          </div>
          <div className="rounded-xl border border-line bg-surface px-4 py-3 text-center">
            <p className="font-serif text-2xl">{stats?.sales ?? "—"}</p>
            <p className="text-[10px] uppercase tracking-widest text-ink-3 mt-0.5">Sales</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {appUser.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-line px-3 py-1 text-xs text-ink-2">
              {tag}
            </span>
          ))}
          <Link
            href="/profile/edit"
            className="h-6 w-6 rounded-full border border-dashed border-line flex items-center justify-center text-ink-3"
            aria-label="Edit tags"
          >
            +
          </Link>
        </div>

        {appUser.bio && <p className="text-sm text-ink-2 mb-6 max-w-md">{appUser.bio}</p>}

        <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-1">Your Catalog</h2>
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-6">
          {CATALOG_ROWS.map((row) => (
            <Link
              key={row.key}
              href={row.key === "music" ? "/profile/catalog" : "/publish"}
              className="flex items-center gap-3 py-3 text-sm"
            >
              <span className="h-4 w-4 text-ink-2 shrink-0">{row.icon}</span>
              <span className="flex-1">{row.label}</span>
              <span className="font-serif text-ink-3">{stats?.catalog[row.key] ?? 0}</span>
            </Link>
          ))}
        </div>

        <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-1">Requests</h2>
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-6">
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-semibold">Collaboration requests</p>
              <p className="text-xs text-ink-3">Nothing pending</p>
            </div>
            <span className="text-ink-3">›</span>
          </div>
          <div className="flex items-center gap-3 py-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 text-ink-3 shrink-0">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 118 0v3" />
            </svg>
            <div>
              <p className="text-sm font-semibold">Private Socials join requests</p>
              <p className="text-xs text-ink-3">Nothing pending</p>
            </div>
          </div>
        </div>

        <Link
          href="/wallet"
          className="flex items-center justify-between py-3 text-sm border-y border-line-soft"
        >
          <span>Wallet</span>
          <span className="text-ink-3">›</span>
        </Link>
      </div>
    </div>
  );
}
