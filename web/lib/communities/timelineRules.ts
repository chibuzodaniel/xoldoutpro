// Community Timeline (explicit ask, 2026-11-11) — shared, client-safe rules.
// Server enforcement lives in lib/communities/timeline.ts and the routes.

export const POSTING_MODES = ["OPEN", "APPROVAL", "ADMIN_ONLY"] as const;
export type PostingMode = (typeof POSTING_MODES)[number];

export const POSTING_MODE_LABEL: Record<PostingMode, { title: string; hint: string }> = {
  OPEN: { title: "Open Posting", hint: "All members can publish straight to the Timeline." },
  APPROVAL: { title: "Approval Required", hint: "Members submit posts; an admin approves them before anyone else sees them." },
  ADMIN_ONLY: { title: "Admin Only", hint: "Only admins post. Members can still comment, reply, like and vote." },
};

/** Post types. Admin-only ones need admin rights whatever the posting mode. */
export const TIMELINE_KINDS = [
  { key: "POST", label: "Post", admin: false },
  { key: "DISCUSSION", label: "Discussion", admin: false },
  { key: "QUESTION", label: "Question", admin: false },
  { key: "ACHIEVEMENT", label: "Music & wins", admin: false },
  { key: "COLLAB", label: "Looking for collaborators", admin: false },
  { key: "SESSION_UPDATE", label: "Recording session", admin: false },
  { key: "ANNOUNCEMENT", label: "Announcement", admin: true },
  { key: "CAMP_UPDATE", label: "Recording camp update", admin: true },
  { key: "POLL", label: "Poll", admin: true },
  { key: "EVENT_RSVP", label: "Event / RSVP", admin: true },
] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number]["key"];
export const TIMELINE_KIND_KEYS = TIMELINE_KINDS.map((k) => k.key) as unknown as readonly [TimelineKind, ...TimelineKind[]];
export const ADMIN_ONLY_KINDS = new Set<string>(TIMELINE_KINDS.filter((k) => k.admin).map((k) => k.key));
export const kindLabel = (k: string | null | undefined) => TIMELINE_KINDS.find((x) => x.key === k)?.label ?? "Post";

export const RSVP_DEFAULT_OPTIONS = ["Yes, I'm coming", "Not sure yet", "Can't make it"];
export const MAX_TIMELINE_MEDIA = 10;
export type TimelineMedia = { url: string; type: "image" | "video" };
