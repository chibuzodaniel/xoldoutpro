"use client";

import { useState } from "react";
import { UserHandleAutocomplete, type UserSuggestion } from "@/components/ui/UserHandleAutocomplete";
import { FallbackImg } from "@/components/ui/FallbackImg";
import {
  MAX_FEATURED_ARTISTS,
  collaboratorSharesError,
  mainArtistSharePercent,
  type CollabArrangement,
} from "@/lib/music/collabRules";

export type FeaturedArtistDraft = { artist: UserSuggestion; arrangement: CollabArrangement; shareText: string };

export function featuredDraftsShares(drafts: FeaturedArtistDraft[]) {
  return drafts.map((d) => ({
    arrangement: d.arrangement,
    sharePercent: d.arrangement === "ROYALTY_SPLIT" ? Math.floor(Number(d.shareText)) || 0 : 0,
  }));
}

/** Null when the drafts can be published, else the message to show. */
export function featuredDraftsError(drafts: FeaturedArtistDraft[]): string | null {
  return collaboratorSharesError(featuredDraftsShares(drafts));
}

export function featuredDraftsPayload(drafts: FeaturedArtistDraft[]) {
  const shares = featuredDraftsShares(drafts);
  return drafts.map((d, i) => ({ artistId: d.artist.id, ...shares[i] }));
}

const ARRANGEMENTS: { value: CollabArrangement; label: string; hint: string }[] = [
  { value: "ROYALTY_SPLIT", label: "Royalty sharing", hint: "They get an agreed % of this release's revenue, split automatically." },
  { value: "CREDIT_ONLY", label: "Feature credit only", hint: "Credited on the release and their profile. You keep 100% of the revenue." },
];

/**
 * Featured artists & revenue sharing on Upload Music (explicit ask,
 * 2026-11-06). Each tagged artist gets a request to accept; nothing is
 * official (or paid) until they do.
 */
export function FeaturedArtistsEditor({
  drafts,
  onChange,
  selfId,
}: {
  drafts: FeaturedArtistDraft[];
  onChange: (d: FeaturedArtistDraft[]) => void;
  selfId?: string;
}) {
  const [query, setQuery] = useState("");
  const shares = featuredDraftsShares(drafts);
  const mainShare = mainArtistSharePercent(shares);
  const hasRoyalty = drafts.some((d) => d.arrangement === "ROYALTY_SPLIT");
  const error = featuredDraftsError(drafts);

  function update(i: number, patch: Partial<FeaturedArtistDraft>) {
    onChange(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }

  return (
    <div className="flex flex-col gap-3">
      {drafts.map((d, i) => (
        <div key={d.artist.id} className="rounded-lg border border-line bg-surface p-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface-2">
              <FallbackImg src={d.artist.avatarUrl} alt={d.artist.displayName} className="h-full w-full object-cover" fallback={null} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{d.artist.displayName}</p>
              <p className="truncate text-xs text-ink-3">@{d.artist.handle}</p>
            </div>
            <button
              type="button"
              onClick={() => onChange(drafts.filter((_, j) => j !== i))}
              aria-label={`Remove ${d.artist.displayName}`}
              className="text-xs text-ink-3"
            >
              Remove
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {ARRANGEMENTS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => update(i, { arrangement: a.value })}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                  d.arrangement === a.value ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <p className="text-[10.5px] text-ink-3">{ARRANGEMENTS.find((a) => a.value === d.arrangement)?.hint}</p>
          {d.arrangement === "ROYALTY_SPLIT" && (
            <label className="flex items-center gap-2 text-xs text-ink-2">
              Their share
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                step="1"
                value={d.shareText}
                onChange={(e) => update(i, { shareText: e.target.value })}
                aria-label={`${d.artist.displayName}'s royalty share in percent`}
                className="w-20 rounded-lg border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-red"
              />
              %
            </label>
          )}
        </div>
      ))}

      {drafts.length < MAX_FEATURED_ARTISTS && (
        <UserHandleAutocomplete
          value={query}
          onChange={setQuery}
          excludeUserId={selfId}
          placeholder="Search an artist by name or @handle"
          className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-red"
          onSelect={(u) => {
            setQuery("");
            if (drafts.some((d) => d.artist.id === u.id)) return;
            onChange([...drafts, { artist: u, arrangement: "ROYALTY_SPLIT", shareText: "" }]);
          }}
        />
      )}

      {hasRoyalty && (
        <div className="rounded-lg border border-line-soft px-3 py-2 text-xs flex flex-col gap-1">
          <div className="flex justify-between">
            <span className="text-ink-3">You</span>
            <span className={mainShare < 0 ? "text-red-soft font-semibold" : "font-semibold"}>{mainShare}%</span>
          </div>
          {drafts.map((d, i) =>
            d.arrangement === "ROYALTY_SPLIT" ? (
              <div key={d.artist.id} className="flex justify-between">
                <span className="text-ink-3">@{d.artist.handle}</span>
                <span className="font-semibold">{shares[i].sharePercent}%</span>
              </div>
            ) : null,
          )}
          <div className="flex justify-between border-t border-line-soft pt-1 mt-0.5">
            <span className="text-ink-3">Total</span>
            <span className="font-semibold">100%</span>
          </div>
          <p className="text-[10.5px] text-ink-3">
            Shares are of your earnings after the platform fee, from sales made after each artist accepts.
          </p>
        </div>
      )}
      {error && drafts.length > 0 && <p className="text-[11px] text-red-soft">{error}</p>}
    </div>
  );
}
