import { idbGet, idbPut, STORE_KEYS } from "./db";

// One AES-GCM key per device, generated non-extractable so the raw key
// material can never leave WebCrypto — the browser stores/uses the CryptoKey
// handle itself in IndexedDB. This is what keeps a downloaded track from
// being pulled out as a loose, shareable file (PRD §9/§16): even with full
// access to IndexedDB, the ciphertext is useless without decrypting through
// this non-exportable key inside the page's own WebCrypto context.
async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  const existing = await idbGet<{ id: string; key: CryptoKey }>(STORE_KEYS, "device");
  if (existing) return existing.key;

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await idbPut(STORE_KEYS, { id: "device", key });
  return key;
}

export async function encryptForOffline(data: ArrayBuffer): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const key = await getOrCreateDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { iv, ciphertext };
}

export async function decryptOffline(iv: Uint8Array, ciphertext: ArrayBuffer): Promise<ArrayBuffer> {
  const key = await getOrCreateDeviceKey();
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ciphertext);
}
