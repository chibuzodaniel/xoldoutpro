"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Status = "NOT_MEMBER" | "MEMBER" | "PENDING";

// Mirrors FollowButton's self-contained fetch-status/toggle pattern, but for
// the one canonical FanbaseGroup a creator owns (oldest one they created) —
// lets a visitor join straight from the profile instead of having to open
// the group page first.
export function FanbaseJoinButton({ groupId, creatorId }: { groupId: string; creatorId: string }) {
  const { appUser, firebaseUser } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!appUser || appUser.id === creatorId) return;
    apiFetch(`/api/groups/${groupId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.myRole) setStatus("MEMBER");
        else if (data.joinRequestStatus === "PENDING") setStatus("PENDING");
        else setStatus("NOT_MEMBER");
      });
  }, [appUser, creatorId, groupId]);

  if (appUser?.id === creatorId) return null;

  async function join() {
    if (!firebaseUser) {
      router.push(`/login?next=/groups/${groupId}`);
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/groups/${groupId}/join`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status === "JOINED" ? "MEMBER" : "PENDING");
      }
    } finally {
      setBusy(false);
    }
  }

  if (status === "MEMBER") {
    return <span className="rounded-lg border border-line px-4 py-1.5 text-xs font-semibold text-ink-2">In Fanbase</span>;
  }
  if (status === "PENDING") {
    return <span className="rounded-lg border border-line px-4 py-1.5 text-xs font-semibold text-ink-3">Request pending</span>;
  }

  return (
    <button
      type="button"
      onClick={join}
      disabled={busy || status === null}
      className="rounded-lg border border-red px-4 py-1.5 text-xs font-semibold text-red-soft transition-colors duration-150 hover:bg-red/10 disabled:opacity-50"
    >
      Join Fanbase
    </button>
  );
}
