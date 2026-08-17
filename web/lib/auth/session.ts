import { NextRequest } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { db } from "@/lib/db";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/** Verifies the bearer Firebase ID token and returns the decoded claims. Does not touch Postgres. */
export async function requireFirebaseUser(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) throw new AuthError("Missing bearer token");
  try {
    return await verifyFirebaseIdToken(idToken);
  } catch {
    throw new AuthError("Invalid or expired token");
  }
}

/** Verifies the token AND resolves the mirrored Postgres User row. 404s (as 401) if sync hasn't run yet. */
export async function requireUser(req: NextRequest) {
  const decoded = await requireFirebaseUser(req);
  const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user) throw new AuthError("Account not synced. Call /api/auth/sync first.");
  return { user, decoded };
}

/** Same as requireUser, but 403s unless the resolved user is internal staff (PRD §3, §14). */
export async function requireModerator(req: NextRequest) {
  const { user, decoded } = await requireUser(req);
  if (!user.isModerator) throw new AuthError("Not authorized", 403);
  return { user, decoded };
}

/**
 * Same as requireUser, but for endpoints that serve both anonymous browsers
 * and signed-in visitors (product access checks, preview audio) — returns
 * null instead of throwing when there's no token, an invalid one, or the
 * user hasn't synced yet, rather than 401ing the whole request.
 */
export async function getOptionalUser(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) return null;
  try {
    const decoded = await verifyFirebaseIdToken(idToken);
    return await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
  } catch {
    return null;
  }
}
