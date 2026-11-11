import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

// The official XOLDOUT account (explicit ask, 2026-11-11): the owner's own
// account, always verified, shown to every user with a one-tap "Message
// XOLDOUT" so anyone can send a complaint straight to it.
export const SUPPORT_ACCOUNT_EMAIL = "chibuzodaniel71@gmail.com";

export type SupportAccount = { id: string; handle: string; displayName: string; avatarUrl: string | null };

async function load(): Promise<SupportAccount | null> {
  const user = await db.user.findFirst({
    where: { email: { equals: SUPPORT_ACCOUNT_EMAIL, mode: "insensitive" }, deletedAt: null },
    select: { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true },
  });
  if (!user) return null;
  // Always verified (one write, the first time only).
  if (!user.isVerified) await db.user.update({ where: { id: user.id }, data: { isVerified: true } });
  return { id: user.id, handle: user.handle, displayName: user.displayName, avatarUrl: user.avatarUrl };
}

/** Cached for an hour — read on many screens, changes almost never. */
export const getSupportAccount = unstable_cache(load, ["support-account-v1"], { revalidate: 3600 });
