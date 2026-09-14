"use client";

import { useAuth } from "@/components/auth/AuthProvider";

// Same reasoning as PublishedByYou.tsx: product/event pages and cards are
// cached Server Components shared across every viewer, so "is this my own
// listing" can't be baked into the server render — renders nothing for
// anyone but the creator.
export function SoldCount({ creatorId, sold }: { creatorId: string; sold: number }) {
  const { appUser } = useAuth();
  if (appUser?.id !== creatorId) return null;

  return <span className="text-[12px] text-ink-3">{sold} sold</span>;
}
