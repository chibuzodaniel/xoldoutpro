import { apiFetch } from "@/lib/api";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Presigns a direct-to-R2 upload, PUTs the file, and returns the resulting object key. */
export async function uploadImage(file: File, kind: "avatar" | "cover" | "artwork") {
  const extension = EXT_BY_TYPE[file.type];
  if (!extension) throw new Error(`Unsupported image type: ${file.type}`);

  const presignRes = await apiFetch("/api/uploads/presign", {
    method: "POST",
    body: JSON.stringify({ kind, contentType: file.type, extension }),
  });
  if (!presignRes.ok) throw new Error("Could not get an upload URL");
  const { key, uploadUrl } = await presignRes.json();

  const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!putRes.ok) throw new Error("Upload to storage failed");

  return key as string;
}
