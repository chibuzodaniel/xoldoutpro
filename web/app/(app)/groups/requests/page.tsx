"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { BackHeader } from "@/components/ui/BackHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/ToastProvider";

// Every pending join request across the private Fanbases this user runs, in
// one place (explicit ask, 2026-10-04: tapping "Private Fanbase join
// requests" on the profile, or the new-request notification, should go
// straight to the pending members list). Grouped by Fanbase; approve/reject
// reuse the per-group PATCH that ManageGroupSheet already uses.

type PendingRequest = {
  id: string;
  createdAt: string;
  user: { id: string; handle: string; displayName: string; avatarUrl: string | null };
  group: { id: string; name: string; coverImageUrl: string | null };
};

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Avatar({ user }: { user: PendingRequest["user"] }) {
  const [failed, setFailed] = useState(false);
  if (user.avatarUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" onError={() => setFailed(true)} />;
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red/20 text-sm font-semibold text-red-soft">
      {(user.displayName.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

export default function FanbaseRequestsPage() {
  const toast = useToast();
  const [requests, setRequests] = useState<PendingRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/groups/join-requests")
      .then((res) => (res.ok ? res.json() : { requests: [] }))
      .then((data) => setRequests(data.requests))
      .catch(() => setRequests([]));
  }, []);

  async function respond(r: PendingRequest, action: "approve" | "reject") {
    setBusyId(r.id);
    try {
      const res = await apiFetch(`/api/groups/${r.group.id}/join-requests/${r.id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      // 409 = someone else (another admin) already handled it — either way it's no longer pending.
      if (!res.ok && res.status !== 409) throw new Error();
      setRequests((cur) => cur?.filter((x) => x.id !== r.id) ?? null);
      toast.success(action === "approve" ? `${r.user.displayName} joined ${r.group.name}.` : `Declined ${r.user.displayName}.`);
    } catch {
      toast.error("Couldn't update that request. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  const byGroup = new Map<string, { group: PendingRequest["group"]; requests: PendingRequest[] }>();
  for (const r of requests ?? []) {
    const entry = byGroup.get(r.group.id) ?? { group: r.group, requests: [] };
    entry.requests.push(r);
    byGroup.set(r.group.id, entry);
  }

  return (
    <div className="pb-10">
      <BackHeader title="Join requests" />
      <div className="px-4">
        {requests === null ? (
          <LoadingSpinner full size="md" />
        ) : requests.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-semibold">Nothing pending</p>
            <p className="mt-1 text-xs text-ink-3">When someone asks to join one of your private Fanbases, they&apos;ll show up here.</p>
          </div>
        ) : (
          [...byGroup.values()].map(({ group, requests: list }) => (
            <section key={group.id} className="mb-8">
              <div className="mb-2 flex items-center justify-between">
                <Link href={`/groups/${group.id}`} className="truncate text-[12px] font-bold uppercase tracking-widest text-ink-3">
                  {group.name}
                </Link>
                <span className="shrink-0 text-[12px] text-ink-3">{list.length} pending</span>
              </div>
              <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
                {list.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 py-3">
                    <Link href={`/u/${r.user.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar user={r.user} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{r.user.displayName}</p>
                        <p className="truncate text-xs text-ink-3">
                          @{r.user.handle} · {timeAgo(r.createdAt)}
                        </p>
                      </div>
                    </Link>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => respond(r, "reject")}
                        className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 disabled:opacity-40"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => respond(r, "approve")}
                        className="rounded-full bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
