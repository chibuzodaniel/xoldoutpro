import { firebaseAuth } from "@/lib/firebase/client";
import { isBackNav } from "@/lib/backNav";

// Short-lived copy of recent GET answers (2026-11-13: back returns to exactly
// where you were). Used ONLY right after back/forward (lib/backNav.ts), so a
// page you return to shows the same content instantly instead of reloading;
// every other request goes to the server as before. Per signed-in account,
// up to 60 answers, 10 minutes each, in this tab's memory only.
const MAX_ENTRIES = 60;
const MAX_AGE_MS = 10 * 60 * 1000;
type Saved = { body: string; status: number; contentType: string | null; at: number };
const saved = new Map<string, Saved>();

function remember(key: string, entry: Saved) {
  saved.delete(key);
  saved.set(key, entry);
  if (saved.size > MAX_ENTRIES) saved.delete(saved.keys().next().value as string);
}

/** fetch() wrapper that attaches the current Firebase ID token as a bearer header. */
export async function apiFetch(input: string, init: RequestInit = {}) {
  const user = firebaseAuth?.currentUser;
  const method = (init.method ?? "GET").toUpperCase();
  const cacheable = method === "GET" && !init.body && input.startsWith("/api/");
  const key = `${user?.uid ?? "anon"} ${input}`;

  if (cacheable && isBackNav()) {
    const hit = saved.get(key);
    if (hit && Date.now() - hit.at < MAX_AGE_MS) {
      return new Response(hit.body, { status: hit.status, headers: hit.contentType ? { "Content-Type": hit.contentType } : undefined });
    }
  }

  const token = await user?.getIdToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(input, { ...init, headers });

  if (cacheable && res.ok) {
    res
      .clone()
      .text()
      .then((body) => remember(key, { body, status: res.status, contentType: res.headers.get("Content-Type"), at: Date.now() }))
      .catch(() => {});
  }
  // Something changed on the server: older copies may be out of date.
  if (!cacheable && method !== "GET") saved.clear();
  return res;
}
