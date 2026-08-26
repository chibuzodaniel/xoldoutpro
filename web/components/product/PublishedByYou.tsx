"use client";

import { useAuth } from "@/components/auth/AuthProvider";

// Product detail pages are cached Server Components (revalidate = 30) shared
// across every viewer, so "is this my own listing" can't be baked into the
// server render — this reads the client-side session and renders nothing
// for anyone but the creator.
export function PublishedByYou({ creatorId }: { creatorId: string }) {
  const { appUser } = useAuth();
  if (appUser?.id !== creatorId) return null;

  return (
    <span className="inline-flex items-center rounded-full bg-red/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-soft align-middle ml-1.5">
      Published by you
    </span>
  );
}
