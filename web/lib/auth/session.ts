import { NextRequest } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { db } from "@/lib/db";

export class AuthError extends Error {
  status = 401;
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
