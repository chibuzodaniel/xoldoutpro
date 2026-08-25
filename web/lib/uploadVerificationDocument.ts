import { apiFetch } from "@/lib/api";

const EXT_BY_TYPE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

/**
 * Presigns a direct-to-R2 upload for one verification document and PUTs the
 * file. Unlike lib/uploadImage.ts, the returned identifier is a document id
 * (not an object key) — the key itself is private and never leaves the
 * server (see lib/storage/r2.ts's presignDownload).
 */
export async function uploadVerificationDocument(applicationId: string, documentType: string, file: File) {
  if (!EXT_BY_TYPE[file.type]) throw new Error(`Unsupported file type: ${file.type}`);

  const presignRes = await apiFetch(`/api/verification/applications/${applicationId}/documents`, {
    method: "POST",
    body: JSON.stringify({ documentType, contentType: file.type }),
  });
  if (!presignRes.ok) {
    const data = await presignRes.json().catch(() => ({}));
    throw new Error(typeof data.error === "string" ? data.error : "Could not get an upload URL");
  }
  const { documentId, uploadUrl } = await presignRes.json();

  const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!putRes.ok) throw new Error("Upload to storage failed");

  return documentId as string;
}
