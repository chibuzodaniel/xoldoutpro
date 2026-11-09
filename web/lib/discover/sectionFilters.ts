// Discover → Beats / Events / Merch chips and shortcut tiles (v2,
// design/v2-prototype). The same lists feed the Drop forms, so what a
// creator picks is exactly what a fan can filter by.

export const BEAT_GENRES = ["Afrobeats", "Trap", "R&B", "Drill", "Amapiano", "Gospel"] as const;
export const BEAT_MOODS = ["Dark", "Chill", "Energetic", "Soulful", "Hype", "Uplifting"] as const;
export const EVENT_TYPES = [
  "Concerts",
  "Festivals",
  "Club nights",
  "Album launches",
  "Listening parties",
  "Comedy shows",
  "Networking events",
  "Workshops",
  "Cultural events",
  "Other",
] as const;
export const MERCH_CATEGORIES = ["Clothing", "Accessories", "Music Merchandise", "Lifestyle", "Technology/Studio Products"] as const;

export type SectionType = "BEAT" | "EVENT" | "MERCH";

export const SECTION_CHIPS: Record<SectionType, readonly string[]> = {
  BEAT: BEAT_GENRES,
  EVENT: EVENT_TYPES,
  MERCH: MERCH_CATEGORIES,
};

export type TileIcon = "sparkle" | "trend" | "gift" | "star" | "clock" | "live" | "pin" | "badge";

export const SECTION_TILES: Record<SectionType, { key: string; title: string; sub: string; icon: TileIcon }[]> = {
  BEAT: [
    { key: "new", title: "New Beats", sub: "Last 7 days", icon: "sparkle" },
    { key: "top", title: "Top Selling", sub: "Most purchased", icon: "trend" },
    { key: "free", title: "Free Beats", sub: "No cost", icon: "gift" },
    { key: "producers", title: "Trending Producers", sub: "Popular producers", icon: "star" },
  ],
  EVENT: [
    { key: "upcoming", title: "Upcoming Events", sub: "Soonest first", icon: "clock" },
    { key: "now", title: "Happening Now", sub: "On today", icon: "live" },
    { key: "near", title: "Near You", sub: "In your city", icon: "pin" },
    { key: "trending", title: "Trending Events", sub: "Rising fast", icon: "trend" },
    { key: "free", title: "Free Events", sub: "No ticket cost", icon: "gift" },
  ],
  MERCH: [
    { key: "new", title: "New Arrivals", sub: "Last 14 days", icon: "sparkle" },
    { key: "popular", title: "Popular Products", sub: "Most liked", icon: "star" },
    { key: "top", title: "Top Selling", sub: "Most ordered", icon: "trend" },
    { key: "featured", title: "Featured Creators", sub: "Verified sellers", icon: "badge" },
  ],
};

/** The chip value if it's one of this section's, else null. */
export function parseChip(type: SectionType, chip: string | undefined | null) {
  return chip && SECTION_CHIPS[type].includes(chip) ? chip : null;
}

/** The tile key if it's one of this section's, else null. */
export function parseTile(type: SectionType, tile: string | undefined | null) {
  return tile && SECTION_TILES[type].some((t) => t.key === tile) ? tile : null;
}
