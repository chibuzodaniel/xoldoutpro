// Mirrors web/lib/music/tags.ts — keep the two in step. Music tab genres and
// moods (V1.2) for the mobile upload form, tag editor and Music tab. Stored
// on Release as slugs.
//

export const GENRES = [
  { slug: "afrobeats", label: "Afrobeats" },
  { slug: "amapiano", label: "Amapiano" },
  { slug: "hip-hop", label: "Hip Hop" },
  { slug: "rnb", label: "R&B" },
  { slug: "pop", label: "Pop" },
  { slug: "trap", label: "Trap" },
  { slug: "drill", label: "Drill" },
  { slug: "gospel", label: "Gospel" },
  { slug: "highlife", label: "Highlife" },
  { slug: "afro-fusion", label: "Afro-fusion" },
  { slug: "alte", label: "Alté" },
  { slug: "street-hop", label: "Street-hop" },
  { slug: "fuji", label: "Fuji" },
  { slug: "reggae-dancehall", label: "Reggae / Dancehall" },
  { slug: "afro-house", label: "Afro-house" },
  { slug: "soul", label: "Soul" },
  { slug: "rock", label: "Rock" },
  { slug: "electronic", label: "Electronic" },
  { slug: "other", label: "Other" },
] as const;

export const MOODS = [
  { slug: "chill", label: "Chill", icon: "🌙" },
  { slug: "energetic", label: "Energetic", icon: "⚡" },
  { slug: "sad", label: "Sad", icon: "🌧️" },
  { slug: "love", label: "Love", icon: "❤️" },
  { slug: "party", label: "Party", icon: "🎉" },
  { slug: "focus", label: "Focus", icon: "🎯" },
  { slug: "motivational", label: "Motivational", icon: "🔥" },
  { slug: "spiritual", label: "Spiritual", icon: "🙏" },
  { slug: "late-night", label: "Late night", icon: "🌃" },
  { slug: "workout", label: "Workout", icon: "💪" },
] as const;

export type GenreSlug = (typeof GENRES)[number]["slug"];
export type MoodSlug = (typeof MOODS)[number]["slug"];

export const GENRE_SLUGS = GENRES.map((g) => g.slug) as unknown as readonly [GenreSlug, ...GenreSlug[]];
export const MOOD_SLUGS = MOODS.map((m) => m.slug) as unknown as readonly [MoodSlug, ...MoodSlug[]];

export const MIN_GENRES = 1;
export const MAX_GENRES = 3;
export const MAX_MOODS = 4;

export const genreLabel = (slug: string) => GENRES.find((g) => g.slug === slug)?.label ?? slug;
export const moodLabel = (slug: string) => MOODS.find((m) => m.slug === slug)?.label ?? slug;

export const isGenre = (s: string | null | undefined): s is GenreSlug => GENRES.some((g) => g.slug === s);
export const isMood = (s: string | null | undefined): s is MoodSlug => MOODS.some((m) => m.slug === s);
