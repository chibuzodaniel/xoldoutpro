"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { apiFetch } from "@/lib/api";

export function FollowButton({
  targetUserId,
  size = "default",
  // Callers that already know the follow status (e.g. a feed post whose API
  // response already computed followedByMe) can skip this component's own
  // self-fetch entirely — saves one GET /api/follow per instance when a
  // list renders many of these at once.
  initialFollowing,
}: {
  targetUserId: string;
  size?: "default" | "compact";
  initialFollowing?: boolean;
}) {
  const { appUser } = useAuth();
  const toast = useToast();
  const [following, setFollowing] = useState<boolean | null>(initialFollowing ?? null);

  useEffect(() => {
    if (!appUser || appUser.id === targetUserId || initialFollowing !== undefined) return;
    apiFetch(`/api/follow?targetUserId=${targetUserId}`)
      .then((res) => (res.ok ? res.json() : { following: false }))
      .then((data) => setFollowing(Boolean(data.following)));
  }, [appUser, targetUserId, initialFollowing]);

  if (!appUser || appUser.id === targetUserId) return null;

  async function toggle() {
    const next = !following;
    setFollowing(next);
    const res = await apiFetch(`/api/follow${next ? "" : `?targetUserId=${targetUserId}`}`, {
      method: next ? "POST" : "DELETE",
      body: next ? JSON.stringify({ targetUserId }) : undefined,
    });
    if (!res.ok) {
      setFollowing(!next);
      toast.error(next ? "Couldn't follow. Try again." : "Couldn't unfollow. Try again.");
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={following === null}
      className={`shrink-0 rounded-lg border font-semibold transition-colors duration-150 ${
        size === "compact" ? "px-2.5 py-1 text-[11px]" : "px-4 py-1.5 text-xs"
      } ${
        following ? "border-line text-ink-2 hover:border-line-strong hover:text-ink" : "border-red bg-red text-white hover:bg-red-soft hover:border-red-soft"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
