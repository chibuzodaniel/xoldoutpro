import { GENRES } from "@/lib/music/tags";
import { BEAT_GENRES, MERCH_CATEGORIES } from "@/lib/discover/sectionFilters";

// "Filter chart" (v2, design/v2-prototype): which filters each chart offers,
// their options, and the URL params they live in. Client-safe.

export type ChartFilterKey = "genre" | "rtype" | "loc" | "pcat" | "price";
export type ChartFilters = Partial<Record<ChartFilterKey, string>> & { q?: string };

export const PRICE_OPTIONS = [
  { value: "lt2", label: "Under ₦2,000", test: (k: number) => k < 200_000 },
  { value: "2to5", label: "₦2,000–₦5,000", test: (k: number) => k >= 200_000 && k <= 500_000 },
  { value: "gt5", label: "Over ₦5,000", test: (k: number) => k > 500_000 },
] as const;

export const RELEASE_TYPE_OPTIONS = [
  { value: "SINGLE", label: "Single" },
  { value: "EP", label: "EP" },
  { value: "ALBUM", label: "Album" },
];

export const LOCATION_OPTIONS = ["Lagos", "Abuja", "Port Harcourt", "Online"].map((l) => ({ value: l, label: l }));

const MUSIC_GENRES = GENRES.map((g) => ({ value: g.slug, label: g.label }));
const BEAT_GENRE_OPTIONS = BEAT_GENRES.map((g) => ({ value: g.toLowerCase(), label: g }));

/** The filters a chart offers, in the order the sheet shows them. */
export function chartFilterGroups(chart: string): { key: ChartFilterKey; label: string; options: { value: string; label: string }[] }[] {
  const price = { key: "price" as const, label: "Price", options: PRICE_OPTIONS.map(({ value, label }) => ({ value, label })) };
  switch (chart) {
    case "top":
    case "music":
    case "viral":
    case "rising":
      return [
        { key: "genre", label: "Genre", options: MUSIC_GENRES },
        { key: "rtype", label: "Release type", options: RELEASE_TYPE_OPTIONS },
        price,
      ];
    case "beats":
      return [{ key: "genre", label: "Genre", options: BEAT_GENRE_OPTIONS }, price];
    case "merch":
      return [{ key: "pcat", label: "Product category", options: MERCH_CATEGORIES.map((c) => ({ value: c, label: c })) }, price];
    case "events":
      return [{ key: "loc", label: "Location", options: LOCATION_OPTIONS }, price];
    default:
      return [];
  }
}

/** Only the params this chart understands, and only valid values. */
export function parseChartFilters(chart: string, raw: Record<string, string | undefined>): ChartFilters {
  const out: ChartFilters = {};
  for (const g of chartFilterGroups(chart)) {
    const v = raw[g.key];
    if (v && g.options.some((o) => o.value === v)) out[g.key] = v;
  }
  const q = raw.q?.trim().slice(0, 60);
  if (q) out.q = q;
  return out;
}

export function priceMatches(value: string | undefined, kobo: number | null | undefined) {
  if (!value) return true;
  const opt = PRICE_OPTIONS.find((o) => o.value === value);
  return !opt || (kobo != null && opt.test(kobo));
}
