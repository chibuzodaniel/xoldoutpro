"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useModeratorSession } from "@/lib/useModeratorSession";
import { ModeratorLoginForm } from "@/components/moderation/ModeratorLoginForm";
import { ModeratorOtpForm } from "@/components/moderation/ModeratorOtpForm";
import { ModerationShell } from "@/components/moderation/ModerationShell";

// Rebuilt (DECISIONS.md): this file used to be the whole 2559-line
// dashboard — every panel now lives in its own file under
// components/moderation/, assembled by ModerationShell's grouped sidebar
// nav. This file keeps only the auth/OTP gate it always owned.
export default function ModerationPage() {
  const { firebaseUser, appUser, loading } = useAuth();
  const { verified: otpVerified, markVerified } = useModeratorSession();

  if (loading) return <LoadingSpinner full size="lg" />;
  // /moderation owns its own auth gate (app/(app)/layout.tsx's SELF_GATED) —
  // a signed-out visitor gets a login form right here, not a bounce through
  // the consumer /login page.
  if (!firebaseUser) return <ModeratorLoginForm />;
  if (!appUser) return <LoadingSpinner full size="lg" />; // firebaseUser exists but the Postgres row hasn't synced yet
  if (!appUser.isModerator) {
    return (
      <div className="px-4 py-6">
        <h1 className="font-serif text-2xl mb-2">Moderation</h1>
        <p className="text-sm text-ink-3">You don&apos;t have access to this page.</p>
      </div>
    );
  }
  // Explicit ask: the same email/password as their regular account gets a
  // moderator to here, but a one-time code is still required every time the
  // 60s inactivity window (useModeratorSession) has lapsed.
  if (!otpVerified) return <ModeratorOtpForm email={appUser.email} onVerified={markVerified} />;

  return <ModerationShell />;
}
