"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { FollowButton } from "@/components/profile/FollowButton";
import { CountryFlag } from "@/components/profile/CountryFlag";
import { VerifiedBadge, primaryBadgeType } from "@/components/profile/VerifiedBadge";

type Person = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  countryCode?: string | null;
  verificationBadges: string[];
  role: string | null;
  followers: number;
  followsYou: boolean;
};

// People to follow on Socials (design/v2-prototype, 2026-11-09). One fetch
// when Socials opens (GET /api/socials/suggestions); no polling.
export function PeopleToFollow() {
  const [people, setPeople] = useState<Person[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/socials/suggestions")
      .then((res) => (res.ok ? res.json() : { people: [] }))
      .then((d) => !cancelled && setPeople(d.people))
      .catch(() => !cancelled && setPeople([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!people || people.length === 0) return null;

  return (
    <section className="mt-7">
      <h2 className="font-serif text-2xl font-bold">People to follow</h2>
      <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {people.map((p) => (
          <div key={p.id} className="flex w-44 shrink-0 flex-col items-center rounded-2xl border border-line bg-surface p-4 text-center">
            <Link href={`/u/${p.handle}`} className="h-20 w-20 overflow-hidden rounded-full bg-gradient-to-br from-red/50 to-black">
              <FallbackImg
                src={p.avatarUrl}
                alt={p.displayName}
                className="h-full w-full object-cover"
                fallback={<span className="flex h-full w-full items-center justify-center font-serif text-2xl text-white">{p.displayName.slice(0, 1).toUpperCase()}</span>}
              />
            </Link>
            <Link href={`/u/${p.handle}`} className="mt-3 flex max-w-full items-center gap-1 text-[15px] font-bold">
              <span className="truncate">{p.displayName}</span>
              {p.isVerified && <VerifiedBadge className="h-3.5 w-3.5 shrink-0" badgeType={primaryBadgeType(p.verificationBadges)} />}
              <CountryFlag code={p.countryCode} />
            </Link>
            <p className="text-[12px] text-ink-3">
              {p.role ? `${p.role} · ` : ""}
              {p.followers.toLocaleString("en-NG")}
            </p>
            <p className="h-4 text-[12px] text-ink-3">{p.followsYou ? "Follows you" : ""}</p>
            <div className="mt-3">
              <FollowButton targetUserId={p.id} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
