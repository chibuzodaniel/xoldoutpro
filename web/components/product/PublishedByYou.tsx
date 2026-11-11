"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

// Product detail pages are cached Server Components (revalidate = 30) shared
// across every viewer, so "is this my own listing" can't be baked into the
// server render — this reads the client-side session and renders nothing
// for anyone but the creator.
export function PublishedByYou({ creatorId, editHref }: { creatorId: string; editHref?: string }) {
  const { appUser } = useAuth();
  if (appUser?.id !== creatorId) return null;

  const badge = (
    <span className="inline-flex items-center rounded-full bg-red/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-soft align-middle ml-1.5">
      Published by you
    </span>
  );
  if (!editHref) return badge;
  // Beats and merch: the Edit listing screen (explicit ask, 2026-11-11).
  return (
    <span className="inline-flex items-center gap-2">
      {badge}
      <Link href={editHref} className="inline-flex items-center gap-1.5 rounded-full border border-red/60 px-3 py-1 text-[11px] font-semibold text-red-soft hover:border-red">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3" aria-hidden>
          <path d="M4 20h4L19 9l-4-4L4 16v4z" strokeLinejoin="round" />
        </svg>
        Edit listing
      </Link>
    </span>
  );
}
