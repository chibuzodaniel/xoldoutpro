"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { BottomNav } from "@/components/nav/BottomNav";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { ExpandedPlayer } from "@/components/player/ExpandedPlayer";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { firebaseUser, appUser, loading, needsOnboarding } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      router.replace("/login");
    } else if (needsOnboarding) {
      router.replace("/onboarding");
    }
  }, [loading, firebaseUser, needsOnboarding, router]);

  if (loading || !firebaseUser || !appUser) {
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
