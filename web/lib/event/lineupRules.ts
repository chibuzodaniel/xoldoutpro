// Shared by the lineup API (lib/event/lineup.ts) and the client editor.
export const MAX_LINEUP = 20;

// Performer roles (2026-11-11).
export const LINEUP_ROLES = ["HEADLINER", "SUPPORTING", "SPECIAL_GUEST", "DJ", "ARTIST"] as const;
export type LineupRole = (typeof LINEUP_ROLES)[number];
export const LINEUP_ROLE_LABEL: Record<string, string> = {
  HEADLINER: "Headliner",
  SUPPORTING: "Supporting Act",
  SPECIAL_GUEST: "Special Guest",
  DJ: "DJ",
  ARTIST: "Artist",
};
