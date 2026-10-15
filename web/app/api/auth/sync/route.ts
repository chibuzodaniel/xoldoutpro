import { NextRequest, NextResponse } from "next/server";
import { requireFirebaseUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { generateUniqueHandle } from "@/lib/handle";
import { sendWelcomeEmail } from "@/lib/email";

const SITE_URL = "https://www.xoldout.app";

/**
 * Called by the client immediately after a Firebase sign-in/sign-up.
 * Creates the mirrored Postgres User row on first sign-in with a
 * placeholder handle; the client sends the user to onboarding to pick a
 * real one when `needsOnboarding` comes back true.
 */
export async function POST(req: NextRequest) {
  try {
    const decoded = await requireFirebaseUser(req);
    // Ambassador program: only ever consulted for a brand-new row below —
    // an existing user's referredByAmbassadorId is set once, at their own
    // first-ever sign-in, and never reassigned on a later sync call.
    const body = await req.json().catch(() => ({}));
    const referralCode: string | undefined = typeof body?.referralCode === "string" ? body.referralCode : undefined;

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

    const referredByAmbassador = referralCode
      ? await db.user.findUnique({ where: { ambassadorCode: referralCode } })
      : null;

    // An abandoned guest checkout leaves a hidden pending placeholder holding
    // this email (User.pendingGuestAt) — signing up for real takes it over
    // rather than colliding on the unique email. It goes through onboarding
    // to pick a real handle like any other new account.
    const pendingGuest = await db.user.findFirst({ where: { email: decoded.email, pendingGuestAt: { not: null } } });
    if (pendingGuest) {
      const handle = await generateUniqueHandle(decoded.email.split("@")[0]);
      const adopted = await db.user.update({
        where: { id: pendingGuest.id },
        data: {
          firebaseUid: decoded.uid,
          handle,
          pendingGuestAt: null,
          displayName: (decoded.name as string | undefined) ?? pendingGuest.displayName,
          avatarUrl: (decoded.picture as string | undefined) ?? null,
          referredByAmbassadorId: referredByAmbassador?.isAmbassador ? referredByAmbassador.id : null,
        },
      });
      void sendWelcomeEmail({ to: adopted.email, profileUrl: `${SITE_URL}/onboarding` }).catch((err) => console.error("welcome email failed", err));
      return NextResponse.json({ user: adopted, needsOnboarding: true });
    }

    const handle = await generateUniqueHandle(decoded.email.split("@")[0]);
    const user = await db.user.create({
      data: {
        firebaseUid: decoded.uid,
        email: decoded.email,
        handle,
        displayName: (decoded.name as string | undefined) ?? handle,
        avatarUrl: (decoded.picture as string | undefined) ?? null,
        referredByAmbassadorId: referredByAmbassador?.isAmbassador ? referredByAmbassador.id : null,
      },
    });

    // Fire-and-forget — a stalled/failed welcome email should never block
    // the sign-up response the client is waiting on to move to onboarding.
    void sendWelcomeEmail({ to: user.email, profileUrl: `${SITE_URL}/onboarding` }).catch((err) =>
      console.error("welcome email failed", err),
    );

    return NextResponse.json({ user, needsOnboarding: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
