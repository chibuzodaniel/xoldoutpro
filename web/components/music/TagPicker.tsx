"use client";

import { GENRES, MOODS, MAX_GENRES, MAX_MOODS } from "@/lib/music/tags";

function toggle(list: string[], slug: string, max: number) {
  if (list.includes(slug)) return list.filter((s) => s !== slug);
  return list.length >= max ? list : [...list, slug];
}

// Genre + mood chips for a release (Music tab, V1.2) — used by the music
// upload and by the tag editor on a release's own page.
export function TagPicker({
  genres,
  moods,
  onGenres,
  onMoods,
}: {
  genres: string[];
  moods: string[];
  onGenres: (next: string[]) => void;
  onMoods: (next: string[]) => void;
}) {
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
      active ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
    }`;
  return (
    <div className="flex flex-col gap-4">
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
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Mood</label>
          <span className="text-[11px] text-ink-3">Optional · up to {MAX_MOODS}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <button key={m.slug} type="button" onClick={() => onMoods(toggle(moods, m.slug, MAX_MOODS))} className={chip(moods.includes(m.slug))}>
              <span className="mr-1" aria-hidden>
                {m.icon}
              </span>
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
