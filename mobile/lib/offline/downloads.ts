import { Directory, File, Paths } from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import CryptoJS from "crypto-js";
import { apiGet } from "../api";

// Mirrors web's lib/offline/downloads.ts: downloaded audio is encrypted at
// rest (AES, key held in SecureStore's keychain/keystore-backed storage —
// not in the plain AsyncStorage index) rather than sitting on disk as a
// playable file, so browsing the filesystem directly doesn't hand over
// purchased audio. Decrypted only into a throwaway cache file at the moment
// of playback.
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

const INDEX_KEY = "xoldout-downloads-index";
const ENCRYPTION_KEY_STORE_KEY = "xoldout-offline-key";
const downloadsDir = new Directory(Paths.document, "downloads");

// crypto-js's own WordArray.random() (used internally by AES.encrypt to
// generate a salt/IV when none is supplied) throws "Native crypto module
// could not be used to get secure random number" in this RN environment —
// it detects a `global.crypto` that doesn't behave the way it expects and
// has no working fallback. Every random value here goes through
// expo-crypto instead, and is always passed to CryptoJS explicitly, so its
// broken internal RNG path is never reached.
async function randomHex(byteCount: number): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(byteCount);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getEncryptionKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORE_KEY);
  if (existing) return existing;
  const key = await randomHex(32);
  await SecureStore.setItemAsync(ENCRYPTION_KEY_STORE_KEY, key);
  return key;
}

async function getIndex(): Promise<Record<string, DownloadMeta>> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function setIndex(index: Record<string, DownloadMeta>): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

function encryptedFileFor(trackId: string): File {
  return new File(downloadsDir, `${trackId}.enc`);
}

export async function downloadTrackForOffline(
  track: {
    trackId: string;
    productId: string;
    title: string;
    artistName: string;
    artworkUrl: string | null;
    durationSec: number;
  },
  idToken: string,
): Promise<void> {
  const data = await apiGet<{ url: string; entitled: boolean }>(`/api/tracks/${track.trackId}/audio-url`, idToken);
  if (!data.entitled) throw new Error("You need to own this release before downloading it");

  if (!downloadsDir.exists) downloadsDir.create({ intermediates: true });

  const tempFile = await File.downloadFileAsync(data.url, Paths.cache);
  const base64 = await tempFile.base64();
  tempFile.delete();

  const keyHex = await getEncryptionKey();
  const ivHex = await randomHex(16);
  const encrypted = CryptoJS.AES.encrypt(base64, CryptoJS.enc.Hex.parse(keyHex), { iv: CryptoJS.enc.Hex.parse(ivHex) });
  // IV isn't embedded in the ciphertext when a raw key + explicit iv are
  // used (only in passphrase mode), so it's stored alongside, plainly —
  // an IV is not a secret, only the key is.
  const ciphertext = `${ivHex}:${encrypted.toString()}`;

  const outFile = encryptedFileFor(track.trackId);
  if (outFile.exists) outFile.delete();
  outFile.create();
  outFile.write(ciphertext);

  const index = await getIndex();
  index[track.trackId] = { ...track, sizeBytes: outFile.size, downloadedAt: Date.now() };
  await setIndex(index);
}

export async function listDownloads(): Promise<DownloadMeta[]> {
  return Object.values(await getIndex());
}

export async function isDownloaded(trackId: string): Promise<boolean> {
  const index = await getIndex();
  return Boolean(index[trackId]);
}

export async function removeDownload(trackId: string): Promise<void> {
  const file = encryptedFileFor(trackId);
  if (file.exists) file.delete();
  const index = await getIndex();
  delete index[trackId];
  await setIndex(index);
}

/** Decrypts a downloaded track into a playable file:// URI in the cache dir. */
export async function getOfflinePlaybackUri(trackId: string): Promise<string | null> {
  const file = encryptedFileFor(trackId);
  if (!file.exists) return null;

  const stored = await file.text();
  const [ivHex, ciphertext] = stored.split(":");
  const keyHex = await getEncryptionKey();
  const base64 = CryptoJS.AES.decrypt(ciphertext, CryptoJS.enc.Hex.parse(keyHex), {
    iv: CryptoJS.enc.Hex.parse(ivHex),
  }).toString(CryptoJS.enc.Utf8);

  const playbackFile = new File(Paths.cache, `offline-${trackId}.mp3`);
  if (playbackFile.exists) playbackFile.delete();
  playbackFile.create();
  playbackFile.write(base64, { encoding: "base64" });
  return playbackFile.uri;
}

export async function totalDownloadBytes(): Promise<number> {
  const rows = await listDownloads();
  return rows.reduce((sum, r) => sum + r.sizeBytes, 0);
}
