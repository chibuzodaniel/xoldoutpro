import { firebaseAuth } from "@/lib/firebase/client";

/** fetch() wrapper that attaches the current Firebase ID token as a bearer header. */
export async function apiFetch(input: string, init: RequestInit = {}) {
  const token = await firebaseAuth?.currentUser?.getIdToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(input, { ...init, headers });
}
