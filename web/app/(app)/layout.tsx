"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

// Open-browsing routes under (app) — viewable without an account. Everything
// else here (library, profile, publish, wallet, socials, analytics, checkout)
// is a personal/creator surface and stays behind the login wall. Purchase
// itself is gated separately, at the API layer (requireUser in /api/orders).
const PUBLIC_EXACT = new Set(["/discover", "/search"]);
const PUBLIC_PREFIXES = ["/r/", "/b/", "/e/", "/m/"];

// Not "public" (a signed-out visitor still can't see the dashboard) — this
// is a route that owns its *own* auth gate instead of the consumer login/
// onboarding flow every other route here shares, so a moderator can go
// straight to /moderation and log in right there rather than bouncing
// through /login (a separate, explicit ask). ModerationPage itself decides
// what to render for every combination of signed-out/non-moderator/moderator.
const SELF_GATED = new Set(["/moderation"]);

function isPublicPath(pathname: string) {
  return PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { firebaseUser, appUser, loading, needsOnboarding } = useAuth();
  const isPublic = isPublicPath(pathname ?? "");
  const isSelfGated = SELF_GATED.has(pathname ?? "");

  useEffect(() => {
    if (loading || isPublic || isSelfGated) return;
    if (!firebaseUser) {
      router.replace("/login");
    } else if (needsOnboarding) {
      router.replace("/onboarding");
    }
  }, [loading, firebaseUser, needsOnboarding, router, isPublic, isSelfGated]);

  if (loading) {
    return <LoadingSpinner full size="lg" />;
  }
  if (!isPublic && !isSelfGated && (!firebaseUser || !appUser)) {
    return <LoadingSpinner full size="lg" />;
  }

  return children;
}
