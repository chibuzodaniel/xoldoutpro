import { NextRequest, NextResponse } from "next/server";
import { requireFirebaseUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { generateUniqueHandle } from "@/lib/handle";

/**
 * Called by the client immediately after a Firebase sign-in/sign-up.
 * Creates the mirrored Postgres User row on first sign-in with a
 * placeholder handle; the client sends the user to onboarding to pick a
 * real one when `needsOnboarding` comes back true.
 */
export async function POST(req: NextRequest) {
  try {
    const decoded = await requireFirebaseUser(req);

    const existing = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (existing) {
      if (existing.deletedAt) {
        return NextResponse.json({ user: existing, needsOnboarding: false, accountDeleted: true });
      }
      return NextResponse.json({ user: existing, needsOnboarding: false });
    }

    if (!decoded.email) {
      return NextResponse.json({ error: "Firebase account has no email" }, { status: 400 });
    }

    const handle = await generateUniqueHandle(decoded.email.split("@")[0]);
    const user = await db.user.create({
      data: {
        firebaseUid: decoded.uid,
        email: decoded.email,
        handle,
        displayName: (decoded.name as string | undefined) ?? handle,
        avatarUrl: (decoded.picture as string | undefined) ?? null,
      },
    });

    return NextResponse.json({ user, needsOnboarding: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
