"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { BottomNav } from "@/components/nav/BottomNav";

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
    return <div className="flex flex-1 items-center justify-center text-ink-3 text-sm">Loading…</div>;
  }

  return (
    <div className="flex flex-1 flex-col min-h-screen">
      <div className="flex-1 overflow-y-auto pb-2">{children}</div>
      <BottomNav />
    </div>
  );
}
