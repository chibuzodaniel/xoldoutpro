// Profile sections (v2, design/v2-prototype): what visitors see on a public
// profile. Stored as User.profileSections (JSON); missing keys use these
// defaults, so every existing profile looks exactly as before — except the
// new Music library, which is off until the owner turns it on (purchases stay
// private by default).

export const PROFILE_SECTIONS = [
  { key: "links", label: "Links", sub: "Your link buttons and social icons" },
  { key: "products", label: "XOLDOUT products", sub: "Music, beats, events, merch and subscription" },
  { key: "posts", label: "Posts and activity", sub: "Your public posts (followers-only posts stay for followers)" },
  { key: "library", label: "Music library", sub: "Show songs you've bought. Off by default, so purchases stay private." },
  { key: "location", label: "Location", sub: "Show your city on your profile" },
] as const;

export type ProfileSectionKey = (typeof PROFILE_SECTIONS)[number]["key"];
export type ProfileSections = Record<ProfileSectionKey, boolean>;

export const DEFAULT_SECTIONS: ProfileSections = { links: true, products: true, posts: true, library: false, location: true };

export function readSections(raw: unknown): ProfileSections {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_SECTIONS };
  for (const k of Object.keys(DEFAULT_SECTIONS) as ProfileSectionKey[]) {
    if (typeof obj[k] === "boolean") out[k] = obj[k] as boolean;
  }
  return out;
}
