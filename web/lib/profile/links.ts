// Link-in-bio (design/v2-prototype, 2026-11-09). Zero imports so the profile
// pages, the Manage links page and the /api/me validator share one list.
//
// Stored where links always were — User.socialLinks (JSON array), in display
// order. Older entries are just { platform, url }; title and enabled are
// optional additions, so links saved by older app builds stay valid and an
// older build re-saving the array passes the extra fields straight through.

export const LINK_PLATFORMS = [
  "Instagram",
  "X",
  "TikTok",
  "YouTube",
  "Spotify",
  "Apple Music",
  "Audiomack",
  "Boomplay",
  "SoundCloud",
  "Facebook",
  "Website",
  "Link",
] as const;

export type LinkPlatform = (typeof LINK_PLATFORMS)[number];

export const MAX_PROFILE_LINKS = 30;
export const MAX_LINK_TITLE = 60;

export type ProfileLink = { platform: string; url: string; title?: string | null; enabled?: boolean };

/** Links shown on a profile: switched-on ones, in the owner's order. */
export function visibleLinks(links: ProfileLink[] | null | undefined): ProfileLink[] {
  return (links ?? []).filter((l) => l.enabled !== false && l.url);
}

/** What a link is called on the profile: its custom title, else the platform. */
export function linkLabel(link: ProfileLink) {
  return link.title?.trim() || link.platform;
}
