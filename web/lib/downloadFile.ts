"use client";

// The track/beat download endpoints now proxy the actual file through our
// own server (to embed XOLDOUT/artist/artwork tags before it reaches the
// buyer — see lib/audio/serveDownload.ts) instead of handing back a
// presigned URL to navigate to. A plain `window.location.href` navigation
// can't carry the Authorization header apiFetch attaches, so this fetches
// the file as an authenticated Blob instead and triggers the save via a
// synthetic <a download> click — the standard way to save a fetched Blob
// with a real filename, and the filename has to be set explicitly here
// since a blob: URL carries none of the original response's headers.
export async function downloadFileFromResponse(res: Response, fallbackFilename: string): Promise<void> {
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : fallbackFilename;

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}
