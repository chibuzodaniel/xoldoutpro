// Points at the live production API directly — no backend changes needed to
// reach it, since native requests aren't subject to browser CORS and the
// existing routes already authenticate via `Authorization: Bearer <token>`
// rather than cookies. Swap to an env-based URL once a staging API exists.
export const API_BASE_URL = "https://www.xoldout.app";

export async function apiGet<T>(path: string, idToken?: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}
