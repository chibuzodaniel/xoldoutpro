"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { apiFetch } from "@/lib/api";

export function FollowButton({ targetUserId }: { targetUserId: string }) {
  const { appUser } = useAuth();
  const toast = useToast();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!appUser || appUser.id === targetUserId) return;
    apiFetch(`/api/follow?targetUserId=${targetUserId}`)
      .then((res) => (res.ok ? res.json() : { following: false }))
      .then((data) => setFollowing(Boolean(data.following)));
  }, [appUser, targetUserId]);

  if (!appUser || appUser.id === targetUserId) return null;

  async function toggle() {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/follow${following ? `?targetUserId=${targetUserId}` : ""}`, {
        method: following ? "DELETE" : "POST",
        body: following ? undefined : JSON.stringify({ targetUserId }),
      });
      if (res.ok) setFollowing(!following);
      else toast.error(following ? "Couldn't unfollow. Try again." : "Couldn't follow. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy || following === null}
      className={`rounded-lg border px-4 py-1.5 text-xs font-semibold transition-colors duration-150 ${
        following ? "border-line text-ink-2 hover:border-line-strong hover:text-ink" : "border-red bg-red text-white hover:bg-red-soft hover:border-red-soft"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
