import { apiFetch } from "@/lib/api";
import { ADD_ON_EXTENSION_BY_TYPE, MAX_ADD_ON_BYTES } from "@/lib/commerce/addOnRules";

/**
 * Uploads one Creative Add-on file straight to R2 (presigned PUT) with
 * progress, returning its object key. Size is checked here for a fast,
 * friendly error; the server checks again when the add-on is attached.
 */
export async function uploadAddOnFile(file: File, onProgress: (fraction: number) => void): Promise<string> {
  const extension = ADD_ON_EXTENSION_BY_TYPE[file.type];
  if (!extension) throw new Error("Use an image (JPG, PNG, WebP), video (MP4, MOV), PDF or text file");
  if (file.size > MAX_ADD_ON_BYTES) throw new Error("Files can be up to 100 MB — use a YouTube link for longer videos");

  const presignRes = await apiFetch("/api/uploads/presign", {
    method: "POST",
    body: JSON.stringify({ kind: "addon", contentType: file.type, extension }),
  });
  if (!presignRes.ok) throw new Error("Could not get an upload URL");
  const { key, uploadUrl } = await presignRes.json();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload to storage failed")));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.send(file);
  });
  return key as string;
}
