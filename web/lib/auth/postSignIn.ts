import { apiFetch } from "@/lib/api";

/**
 * Call right after a Firebase sign-in succeeds, before navigating anywhere.
 * Returns the account's handle if this login belongs to a deleted account
 * (so the caller can show a "you deleted this account" prompt instead of
 * continuing into the app), or null to proceed normally.
 */
export async function checkAccountDeletedAfterSignIn(): Promise<string | null> {
  const res = await apiFetch("/api/auth/sync", { method: "POST" });
  if (!res.ok) return null;
  const data = await res.json();
  return data.accountDeleted ? (data.user.handle as string) : null;
}
