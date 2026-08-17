"use client";

import { use, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { GroupPostCard, type GroupPost } from "@/components/groups/GroupPostCard";
import { GroupPostComposer } from "@/components/groups/GroupPostComposer";
import { ManageGroupSheet } from "@/components/groups/ManageGroupSheet";

type GroupDetail = {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  visibility: "OPEN" | "REQUEST_TO_JOIN";
  postPermission: "CREATOR_ONLY" | "ADMINS" | "ALL_MEMBERS";
  creator: { handle: string; displayName: string };
  creatorId: string;
  memberCount: number;
};

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { appUser } = useAuth();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [myRole, setMyRole] = useState<"ADMIN" | "MEMBER" | null>(null);
  const [joinRequestStatus, setJoinRequestStatus] = useState<"PENDING" | "APPROVED" | "REJECTED" | null>(null);
  const [posts, setPosts] = useState<GroupPost[] | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [joining, setJoining] = useState(false);

  async function load() {
    const res = await apiFetch(`/api/groups/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setGroup(data.group);
    setMyRole(data.myRole);
    setJoinRequestStatus(data.joinRequestStatus);
  }

  useEffect(() => {
    async function initialLoad() {
      const res = await apiFetch(`/api/groups/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setGroup(data.group);
      setMyRole(data.myRole);
      setJoinRequestStatus(data.joinRequestStatus);
    }
    initialLoad();
  }, [id]);

  useEffect(() => {
    if (myRole === null) return;
    apiFetch(`/api/groups/${id}/posts`)
      .then((res) => (res.ok ? res.json() : { posts: [] }))
      .then((data) => setPosts(data.posts));
  }, [id, myRole]);

  async function handleJoin() {
    setJoining(true);
    try {
      const res = await apiFetch(`/api/groups/${id}/join`, { method: "POST" });
      if (res.ok) await load();
    } finally {
      setJoining(false);
    }
  }

  async function handleLeave() {
    if (!window.confirm("Leave this group?")) return;
    const res = await apiFetch(`/api/groups/${id}/join`, { method: "DELETE" });
    if (res.ok) await load();
  }

  if (group === null) return <LoadingSpinner full size="lg" />;

  const isMember = myRole !== null;
  const amCreator = appUser?.id === group.creatorId;
  const canPost =
    group.postPermission === "ALL_MEMBERS" ? isMember : group.postPermission === "ADMINS" ? myRole === "ADMIN" : amCreator;

  return (
    <div className="pb-10">
      <div className="h-28 w-full bg-surface-2">
        {group.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={group.coverImageUrl} alt={group.name} className="h-full w-full object-cover" />
        )}
      </div>

      <div className="px-4 pt-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 className="font-serif text-2xl">{group.name}</h1>
          {myRole === "ADMIN" && (
            <button type="button" onClick={() => setManageOpen(true)} className="text-xs font-semibold text-red-soft shrink-0">
              Manage
            </button>
          )}
        </div>
        <p className="text-xs text-ink-3 mb-1">
          {group.memberCount} member{group.memberCount === 1 ? "" : "s"} · by {group.creator.displayName}
        </p>
        {group.description && <p className="text-sm text-ink-2 mb-4">{group.description}</p>}

        {!isMember && (
          <div className="mb-6">
            {joinRequestStatus === "PENDING" ? (
              <p className="text-sm text-ink-3">Your request to join is pending approval.</p>
            ) : (
              <button
                type="button"
                onClick={handleJoin}
                disabled={joining}
                className="rounded-lg bg-red px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {joining ? "…" : group.visibility === "OPEN" ? "Join group" : "Request to join"}
              </button>
            )}
          </div>
        )}

        {isMember && !amCreator && (
          <button type="button" onClick={handleLeave} className="text-xs text-ink-3 mb-6">
            Leave group
          </button>
        )}

        {isMember && (
          <>
            {canPost && <GroupPostComposer groupId={id} onPosted={(post) => setPosts((cur) => [post, ...(cur ?? [])])} />}
            {posts === null ? (
              <LoadingSpinner full size="md" />
            ) : posts.length === 0 ? (
              <p className="text-sm text-ink-3">No posts yet.</p>
            ) : (
              <div className="flex flex-col">
                {posts.map((p) => (
                  <GroupPostCard key={p.id} post={p} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <ManageGroupSheet
        groupId={id}
        isCreator={amCreator}
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        postPermission={group.postPermission}
        visibility={group.visibility}
        onSettingsChanged={(patch) =>
          setGroup((cur) => (cur ? { ...cur, ...(patch as Partial<GroupDetail>) } : cur))
        }
      />
    </div>
  );
}
