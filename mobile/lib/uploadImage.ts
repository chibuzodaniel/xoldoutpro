import { apiPost } from "./api";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Mirrors web's lib/uploadImage.ts: presigns a direct-to-R2 upload, PUTs the
// file, and returns the resulting object key. `uri` is a local file:// path
// from expo-image-picker — fetching it gives a Blob fetch can PUT directly,
// same trick React Native has used for local-file uploads since Blob/File
// aren't otherwise constructible from a bare path.
export async function uploadImage(
  uri: string,
  contentType: string,
  kind: "avatar" | "cover" | "artwork",
  idToken: string,
): Promise<string> {
  const extension = EXT_BY_TYPE[contentType];
  if (!extension) throw new Error(`Unsupported image type: ${contentType}`);

  const { key, uploadUrl } = await apiPost<{ key: string; uploadUrl: string }>("/api/uploads/presign", idToken, {
    kind,
    contentType,
    extension,
  });

  const blob = await (await fetch(uri)).blob();
  const putRes = await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": contentType } });
  if (!putRes.ok) throw new Error("Upload to storage failed");

  return key;
}

// Mirrors web's artwork/finalize route call: turns an uploaded "artwork" key
// into a server-generated size ladder (used for release/beat/merch/event art).
export async function uploadAndFinalizeArtwork(uri: string, contentType: string, idToken: string): Promise<Record<string, string>> {
  const key = await uploadImage(uri, contentType, "artwork", idToken);
  const data = await apiPost<{ artworkLadder: Record<string, string> }>("/api/uploads/artwork/finalize", idToken, { key });
  return data.artworkLadder;
}
