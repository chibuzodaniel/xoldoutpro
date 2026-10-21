// Mirrors web/lib/commerce/addOnRules.ts — keep the two in step. Creative
// Add-ons rules for the mobile upload form and Extras section. See web's
// lib/commerce/addOns.ts and the ProductAddOn model.

export const ADD_ON_KINDS = ["MUSIC_VIDEO", "VISUALIZER", "ARTWORK", "WALLPAPER", "LYRICS", "BOOKLET", "BEHIND_THE_SCENES", "OTHER"] as const;
export type AddOnKindName = (typeof ADD_ON_KINDS)[number];

export const ADD_ON_KIND_LABEL: Record<AddOnKindName, string> = {
  MUSIC_VIDEO: "Music video",
  VISUALIZER: "Visualizer",
  ARTWORK: "Exclusive artwork",
  WALLPAPER: "Wallpaper",
  LYRICS: "Lyrics",
  BOOKLET: "Digital booklet",
  BEHIND_THE_SCENES: "Behind the scenes",
  OTHER: "Other",
};

/** Kinds that are usually video — the upload form offers a YouTube link first for these. */
export const VIDEO_KINDS: ReadonlySet<AddOnKindName> = new Set(["MUSIC_VIDEO", "VISUALIZER", "BEHIND_THE_SCENES"]);

// Explicit ask, 2026-10-21: 500 MB was too much — full music videos belong
// on YouTube (linked, not uploaded); uploads are for images, PDFs, lyrics
// and short clips.
export const MAX_ADD_ON_BYTES = 100 * 1024 * 1024;
export const MAX_ADD_ONS_PER_PRODUCT = 10;

export const ADD_ON_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
  "text/plain",
] as const;

export const ADD_ON_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
  "text/plain": "txt",
};

/**
 * The 11-character video id from any common YouTube link shape (watch?v=,
 * youtu.be/, /shorts/, /embed/, /live/), or null if it isn't one.
 */
export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  let url: URL;
  try {
    url = new URL(text.startsWith("http") ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)?.[1] ?? null;
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
