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

type StoredDownload = DownloadMeta & { iv: Uint8Array; ciphertext: ArrayBuffer };

export async function downloadTrackForOffline(track: {
  trackId: string;
  productId: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  durationSec: number;
}): Promise<void> {
  const res = await apiFetch(`/api/tracks/${track.trackId}/audio-url`);
  if (!res.ok) throw new Error("Could not fetch track");
  const { url, entitled } = await res.json();
  if (!entitled) throw new Error("You need to own this release before downloading it");

  const audioRes = await fetch(url);
  if (!audioRes.ok) throw new Error("Could not download audio");
  const bytes = await audioRes.arrayBuffer();

  const { iv, ciphertext } = await encryptForOffline(bytes);

  const record: StoredDownload = {
    ...track,
    iv,
    ciphertext,
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
    artworkUrl: r.artworkUrl,
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
