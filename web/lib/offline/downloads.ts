import { idbDelete, idbGet, idbGetAll, idbPut, STORE_DOWNLOADS } from "./db";
import { encryptForOffline, decryptOffline } from "./crypto";
import { apiFetch } from "@/lib/api";

export type DownloadMeta = {
  trackId: string;
  productId: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  durationSec: number;
  sizeBytes: number;
  downloadedAt: number;
};

// artwork: the cover image itself, saved with the audio (explicit ask,
// 2026-10-21) so a downloaded song still shows its artwork in the player
// and Downloaded list with no connection. Missing on rows downloaded before
// this — backfillOfflineArtwork fills those in when online.
type StoredDownload = DownloadMeta & { iv: Uint8Array; ciphertext: ArrayBuffer; artwork?: Blob };

// One object URL per saved cover for the life of the page, rather than a new
// one (never revoked) every time a list renders.
const artworkObjectUrls = new Map<string, string>();

function artworkFor(row: StoredDownload): string | null {
  if (!row.artwork) return row.artworkUrl;
  let url = artworkObjectUrls.get(row.trackId);
  if (!url) {
    url = URL.createObjectURL(row.artwork);
    artworkObjectUrls.set(row.trackId, url);
  }
  return url;
}

async function fetchArtwork(artworkUrl: string | null): Promise<Blob | undefined> {
  if (!artworkUrl) return undefined;
  try {
    const res = await fetch(artworkUrl);
    return res.ok ? await res.blob() : undefined;
  } catch {
    // Artwork is a nice-to-have — never fail the song download over it.
    return undefined;
  }
}

/** The saved cover for a downloaded track (a blob: URL), if there is one. */
export async function localArtworkUrl(trackId: string): Promise<string | null> {
  const row = await idbGet<StoredDownload>(STORE_DOWNLOADS, trackId);
  return row?.artwork ? artworkFor(row) : null;
}

/** Saves covers for songs downloaded before covers were kept. Returns whether any were added. */
export async function backfillOfflineArtwork(): Promise<boolean> {
  const rows = await idbGetAll<StoredDownload>(STORE_DOWNLOADS);
  let changed = false;
  for (const row of rows) {
    if (row.artwork || !row.artworkUrl) continue;
    const artwork = await fetchArtwork(row.artworkUrl);
    if (!artwork) continue;
    await idbPut(STORE_DOWNLOADS, { ...row, artwork });
    changed = true;
  }
  return changed;
}

export async function downloadTrackForOffline(track: {
  trackId: string;
  productId: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  durationSec: number;
}): Promise<void> {
  // ?offline=1: logged as a download for the seller, not counted as a play.
  const res = await apiFetch(`/api/tracks/${track.trackId}/audio-url?offline=1`);
  if (!res.ok) throw new Error("Could not fetch track");
  const { url, entitled } = await res.json();
  if (!entitled) throw new Error("You need to own this release before downloading it");

  const audioRes = await fetch(url);
  if (!audioRes.ok) throw new Error("Could not download audio");
  const bytes = await audioRes.arrayBuffer();

  const [{ iv, ciphertext }, artwork] = await Promise.all([encryptForOffline(bytes), fetchArtwork(track.artworkUrl)]);

  const record: StoredDownload = {
    ...track,
    iv,
    ciphertext,
    artwork,
    sizeBytes: ciphertext.byteLength,
    downloadedAt: Date.now(),
  };
  await idbPut(STORE_DOWNLOADS, record);
}

export async function listDownloads(): Promise<DownloadMeta[]> {
  const rows = await idbGetAll<StoredDownload>(STORE_DOWNLOADS);
  return rows.map((r) => ({
    trackId: r.trackId,
    productId: r.productId,
    title: r.title,
    artistName: r.artistName,
    artworkUrl: artworkFor(r),
    durationSec: r.durationSec,
    sizeBytes: r.sizeBytes,
    downloadedAt: r.downloadedAt,
  }));
}

export async function isDownloaded(trackId: string): Promise<boolean> {
  const row = await idbGet<StoredDownload>(STORE_DOWNLOADS, trackId);
  return Boolean(row);
}

export async function removeDownload(trackId: string): Promise<void> {
  await idbDelete(STORE_DOWNLOADS, trackId);
  const art = artworkObjectUrls.get(trackId);
  if (art) {
    URL.revokeObjectURL(art);
    artworkObjectUrls.delete(trackId);
  }
}

/** Decrypts a downloaded track into a playable blob: URL. Caller must revoke it when done. */
export async function getOfflinePlaybackUrl(trackId: string): Promise<string | null> {
  const row = await idbGet<StoredDownload>(STORE_DOWNLOADS, trackId);
  if (!row) return null;
  const bytes = await decryptOffline(row.iv, row.ciphertext);
  const blob = new Blob([bytes], { type: "audio/mpeg" });
  return URL.createObjectURL(blob);
}

export async function totalDownloadBytes(): Promise<number> {
  const rows = await listDownloads();
  return rows.reduce((sum, r) => sum + r.sizeBytes, 0);
}
