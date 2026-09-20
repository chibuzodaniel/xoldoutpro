"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Backstop for the four /publish/{music,beat,merch,event} forms, each
 * directly deep-linkable and bypassing PublishOptionsList's own plan gate.
 * The real enforcement is server-side (assertCanPublish, 403 on submit —
 * already surfaced via each form's existing toast.error(data.error)
 * handling), this just avoids letting someone fill out a whole form before
 * finding out they need a plan first.
 */
export function useRequireCreatorPlan() {
  const { appUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !appUser) return;
    if (!appUser.creatorPlan) router.replace("/publish");
  }, [loading, appUser, router]);
}
