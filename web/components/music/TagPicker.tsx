"use client";

import { GENRES, MAX_GENRES } from "@/lib/music/tags";

function toggle(list: string[], slug: string, max: number) {
  if (list.includes(slug)) return list.filter((s) => s !== slug);
  return list.length >= max ? list : [...list, slug];
}

// Genre chips for a release (Music tab, V1.2) — used by the music upload and
// by the tag editor on a release's own page. Moods were removed 2026-11-04.
export function TagPicker({ genres, onGenres }: { genres: string[]; onGenres: (next: string[]) => void }) {
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
      active ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
    }`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label className="text-[12px] uppercase tracking-widest text-ink-3">Genre</label>
        <span className="text-[11px] text-ink-3">Pick 1–{MAX_GENRES}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {GENRES.map((g) => (
          <button key={g.slug} type="button" onClick={() => onGenres(toggle(genres, g.slug, MAX_GENRES))} className={chip(genres.includes(g.slug))}>
            {g.label}
          </button>
        ))}
      </div>
    </div>
  );
}
