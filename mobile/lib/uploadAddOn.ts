import { apiPost } from "./api";
import { ADD_ON_EXTENSION_BY_TYPE, MAX_ADD_ON_BYTES } from "./addOnRules";

// Mirrors web's lib/uploadAddOn.ts: presigned direct-to-R2 PUT of one
// Creative Add-on file, returning its object key. The server re-checks the
// size when the add-on is attached.
export async function uploadAddOnFile(uri: string, contentType: string, sizeBytes: number | undefined, idToken: string): Promise<string> {
  const extension = ADD_ON_EXTENSION_BY_TYPE[contentType];
  if (!extension) throw new Error("Use an image (JPG, PNG, WebP), video (MP4, MOV), PDF or text file");
  if (sizeBytes !== undefined && sizeBytes > MAX_ADD_ON_BYTES) {
    throw new Error("Files can be up to 100 MB — use a YouTube link for longer videos");
  }

  const { key, uploadUrl } = await apiPost<{ key: string; uploadUrl: string }>("/api/uploads/presign", idToken, {
    kind: "addon",
    contentType,
    extension,
  });
  const blob = await (await fetch(uri)).blob();
  const putRes = await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": contentType } });
  if (!putRes.ok) throw new Error("Upload to storage failed");
  return key;
}
