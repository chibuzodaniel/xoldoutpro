"use client";

// Track/beat downloads (lib/audio/serveDownload.ts): the endpoint is called
// with the auth header via apiFetch and answers with a short-lived signed R2
// link whose response already forces a save with the right filename
// (Content-Disposition: attachment). Clicking that link downloads straight
// from storage, so the file never streams through a Vercel function.

/**
 * Downloads via a `?download=1&link=1` audio-url endpoint: the server hands
 * back a short-lived signed R2 link that already forces a save with the
 * right filename (lib/audio/serveDownload.ts), and the browser fetches the
 * file straight from storage — it never streams through our own server.
 * Throws with the server's error message on failure.
 */
export async function downloadViaSignedLink(res: Response): Promise<void> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.url !== "string") {
    throw new Error(typeof data.error === "string" ? data.error : "Could not download file");
  }
  const a = document.createElement("a");
  a.href = data.url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
