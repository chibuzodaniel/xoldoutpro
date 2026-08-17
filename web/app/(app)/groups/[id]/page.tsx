"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { AVATAR_GRADIENTS } from "@/lib/avatarGradients";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ChatMessage, type ChatMessageData } from "@/components/groups/ChatMessage";
import { ChatComposer } from "@/components/groups/ChatComposer";
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
  const [messages, setMessages] = useState<ChatMessageData[] | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessageData | null>(null);
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
      .then((data) => setMessages(data.posts));
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
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line-soft">
        <div
          className={`h-10 w-10 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[0]} flex items-center justify-center text-sm font-semibold text-white/90 shrink-0`}
        >
          {group.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold line-clamp-1">{group.name}</h1>
          <p className="text-xs text-ink-3">
            {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
          </p>
        </div>
        {myRole === "ADMIN" && (
          <button type="button" onClick={() => setManageOpen(true)} className="text-xs font-semibold text-red-soft shrink-0">
            Manage
          </button>
        )}
      </div>

      {group.description && <p className="text-sm text-ink-2 px-4 py-3">{group.description}</p>}

      {!isMember ? (
        <div className="px-4 py-6">
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
      ) : (
        <>
          {!amCreator && (
            <button type="button" onClick={handleLeave} className="text-xs text-ink-3 px-4 pt-3 text-left">
              Leave group
            </button>
          )}

          <div className="flex flex-col gap-4 px-4 py-4">
            {messages === null ? (
              <LoadingSpinner full size="md" />
            ) : messages.length === 0 ? (
              <p className="text-sm text-ink-3">No messages yet — say something.</p>
            ) : (
              messages.map((m) => (
                <ChatMessage key={m.id} message={m} isMine={m.author.id === appUser?.id} onReply={setReplyingTo} />
              ))
            )}
          </div>

          {canPost && (
            <ChatComposer
              groupId={id}
              replyingTo={replyingTo}
              onClearReply={() => setReplyingTo(null)}
              onPosted={(message) => setMessages((cur) => [...(cur ?? []), message])}
            />
          )}
        </>
      )}

      <ManageGroupSheet
        groupId={id}
        isCreator={amCreator}
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        postPermission={group.postPermission}
        visibility={group.visibility}
        onSettingsChanged={(patch) => setGroup((cur) => (cur ? { ...cur, ...(patch as Partial<GroupDetail>) } : cur))}
      />
    </div>
  );
}
