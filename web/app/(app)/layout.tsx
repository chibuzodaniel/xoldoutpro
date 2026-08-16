"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { BottomNav } from "@/components/nav/BottomNav";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { ExpandedPlayer } from "@/components/player/ExpandedPlayer";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

// Open-browsing routes under (app) — viewable without an account. Everything
// else here (library, profile, publish, wallet, socials, analytics, checkout)
// is a personal/creator surface and stays behind the login wall. Purchase
// itself is gated separately, at the API layer (requireUser in /api/orders).
const PUBLIC_EXACT = new Set(["/discover", "/search"]);
const PUBLIC_PREFIXES = ["/r/", "/b/", "/e/", "/m/"];

function isPublicPath(pathname: string) {
  return PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { firebaseUser, appUser, loading, needsOnboarding } = useAuth();
  const isPublic = isPublicPath(pathname ?? "");

  useEffect(() => {
    if (loading || isPublic) return;
    if (!firebaseUser) {
      router.replace("/login");
    } else if (needsOnboarding) {
      router.replace("/onboarding");
    }
  }, [loading, firebaseUser, needsOnboarding, router, isPublic]);

  if (loading) {
    return <LoadingSpinner full size="lg" />;
  }
  if (!isPublic && (!firebaseUser || !appUser)) {
    return <LoadingSpinner full size="lg" />;
  }

  return (
    <PlayerProvider>
      <div className="flex flex-1 flex-col min-h-screen">
        <div className="flex-1 overflow-y-auto pb-2">{children}</div>
        <MiniPlayer />
        <BottomNav />
      </div>
      <ExpandedPlayer />
    </PlayerProvider>
  );
}
