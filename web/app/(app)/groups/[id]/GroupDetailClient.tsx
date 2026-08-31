"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { AVATAR_GRADIENTS } from "@/lib/avatarGradients";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { ImageCropModal } from "@/components/upload/ImageCropModal";
import { ChatMessage, type ChatMessageData } from "@/components/groups/ChatMessage";
import { ChatComposer } from "@/components/groups/ChatComposer";
import { ManageGroupSheet } from "@/components/groups/ManageGroupSheet";
import { useToast } from "@/components/ui/ToastProvider";

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
  isVerified: boolean;
  verificationRequestedAt: string | null;
};

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="M7 8l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The interactive half of /groups/[id] — split out of the route's page.tsx
// so that file can be a Server Component (generateMetadata can't be
// exported from a "use client" file, and this page needs real Open Graph
// data for its Share button's links to preview correctly).
export function GroupDetailClient({ id }: { id: string }) {
  const { appUser, firebaseUser } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [myRole, setMyRole] = useState<"ADMIN" | "MEMBER" | null>(null);
  const [joinRequestStatus, setJoinRequestStatus] = useState<"PENDING" | "APPROVED" | "REJECTED" | null>(null);
  const [messages, setMessages] = useState<ChatMessageData[] | null>(null);
  const [readWatermark, setReadWatermark] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessageData | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hasPositionedRef = useRef(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [shareLabel, setShareLabel] = useState<"idle" | "copied">("idle");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      .then((res) => (res.ok ? res.json() : { posts: [], readWatermark: null }))
      .then((data) => {
        setMessages(data.posts);
        setReadWatermark(data.readWatermark ?? null);
      });
  }, [id, myRole]);

  // Runs once, right after the first real message list renders: opens the
  // thread scrolled to the first message newer than readWatermark (the
  // member's prior lastReadAt/joinedAt, from the API — see
  // GET /api/groups/[id]/posts) so unread messages start right at the top of
  // the viewport and reading continues downward from there. No unread —
  // readWatermark newer than every message, or unknown — opens at the
  // bottom instead, same as any other chat. useLayoutEffect so this happens
  // before paint, not as a visible jump after the top briefly flashes.
  useLayoutEffect(() => {
    if (hasPositionedRef.current || !messages || messages.length === 0) return;
    const container = messagesContainerRef.current;
    if (!container) return;

    const firstUnread = readWatermark
      ? messages.find((m) => new Date(m.createdAt).getTime() > new Date(readWatermark).getTime())
      : undefined;

    if (firstUnread) {
      messageRefs.current.get(firstUnread.id)?.scrollIntoView({ block: "start" });
    } else {
      container.scrollTop = container.scrollHeight;
    }
    hasPositionedRef.current = true;
  }, [messages, readWatermark]);

  async function handleJoin() {
    // A shared group link is often opened signed-out — without this, the
    // join POST just 401s silently and the button appears to do nothing.
    if (!firebaseUser) {
      router.push(`/login?next=/groups/${id}`);
      return;
    }
    setJoining(true);
    try {
      const res = await apiFetch(`/api/groups/${id}/join`, { method: "POST" });
      if (res.ok) await load();
      else toast.error("Couldn't join this Fanbase. Try again.");
    } finally {
      setJoining(false);
    }
  }

  async function handleShare() {
    const url = `${window.location.origin}/groups/${id}`;
    const text = group ? `Join ${group.name} on XOLDOUT` : "Join this Fanbase on XOLDOUT";
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: group?.name, text, url });
      } catch {
        // user dismissed the native share sheet — nothing to do
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareLabel("copied");
      setTimeout(() => setShareLabel("idle"), 1500);
    } catch {
      // clipboard unavailable — silently give up
    }
  }

  async function handlePhotoConfirm(cropped: File) {
    setPhotoFile(null);
    setUploadingPhoto(true);
    try {
      const key = await uploadImage(cropped, "avatar");
      const res = await apiFetch(`/api/groups/${id}/photo`, { method: "POST", body: JSON.stringify({ key }) });
      if (res.ok) {
        const data = await res.json();
        setGroup((cur) => (cur ? { ...cur, coverImageUrl: data.coverImageUrl } : cur));
      } else {
        toast.error("Couldn't update the group photo. Try again.");
      }
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handlePhotoRemove() {
    if (!window.confirm("This group photo will be permanently deleted. Continue?")) return;
    setUploadingPhoto(true);
    try {
      const res = await apiFetch(`/api/groups/${id}/photo`, { method: "DELETE" });
      if (res.ok) {
        setGroup((cur) => (cur ? { ...cur, coverImageUrl: null } : cur));
      } else {
        toast.error("Couldn't delete the group photo. Try again.");
      }
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleLeave() {
    if (!window.confirm("Leave this group?")) return;
    const res = await apiFetch(`/api/groups/${id}/join`, { method: "DELETE" });
    if (res.ok) await load();
    else toast.error("Couldn't leave this group. Try again.");
  }

  if (group === null) return <LoadingSpinner full size="lg" />;

  const isMember = myRole !== null;
  const amCreator = appUser?.id === group.creatorId;
  const canPost =
    group.postPermission === "ALL_MEMBERS" ? isMember : group.postPermission === "ADMINS" ? myRole === "ADMIN" : amCreator;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line-soft shrink-0">
        <button type="button" onClick={() => router.back()} className="text-xl text-ink-2 shrink-0" aria-label="Back">
          ‹
        </button>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => myRole === "ADMIN" && fileInputRef.current?.click()}
            disabled={myRole !== "ADMIN" || uploadingPhoto}
            aria-label={myRole === "ADMIN" ? "Change group photo" : undefined}
            className={`relative h-10 w-10 rounded-full overflow-hidden flex items-center justify-center text-sm font-semibold text-white/90 ${
              group.coverImageUrl ? "bg-surface-2" : `bg-gradient-to-br ${AVATAR_GRADIENTS[0]}`
            }`}
          >
            {group.coverImageUrl ? (
              <Image src={group.coverImageUrl} alt={group.name} fill sizes="40px" className="object-cover" />
            ) : (
              group.name.slice(0, 1).toUpperCase()
            )}
            {uploadingPhoto && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              </span>
            )}
          </button>
          {myRole === "ADMIN" && group.coverImageUrl && !uploadingPhoto && (
            <button
              type="button"
              onClick={handlePhotoRemove}
              aria-label="Delete group photo"
              className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center"
            >
              ×
            </button>
          )}
        </div>
        {myRole === "ADMIN" && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPhotoFile(file);
              e.target.value = "";
            }}
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1 text-base font-semibold">
            <span className="line-clamp-1">{group.name}</span>
            {group.isVerified && <VerifiedBadge />}
          </h1>
          <p className="text-xs text-ink-3">
            {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
          </p>
        </div>
        {isMember && (
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share this Fanbase"
            className="text-ink-3 shrink-0"
          >
            {shareLabel === "copied" ? <span className="text-[11px] text-ink-3">Copied</span> : <ShareIcon />}
          </button>
        )}
        {myRole === "ADMIN" && (
          <button type="button" onClick={() => setManageOpen(true)} className="text-xs font-semibold text-red-soft shrink-0">
            Manage
          </button>
        )}
      </div>

      {group.description && <p className="text-sm text-ink-2 px-4 py-3 shrink-0">{group.description}</p>}

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
            <button type="button" onClick={handleLeave} className="text-xs text-ink-3 px-4 pt-3 text-left shrink-0">
              Leave group
            </button>
          )}

          {/* flex-1 min-h-0 + its own overflow-y-auto is what actually pins
              the composer below at the viewport's bottom on a short thread —
              a plain block here relies on `sticky` having scrollable
              overflow to stick against, which a thread shorter than the
              screen never has, so the composer just sat wherever the last
              message happened to end instead of at the bottom. */}
          <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 px-4 py-4">
            {messages === null ? (
              <LoadingSpinner full size="md" />
            ) : messages.length === 0 ? (
              <p className="text-sm text-ink-3">No messages yet — say something.</p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  ref={(el) => {
                    if (el) messageRefs.current.set(m.id, el);
                    else messageRefs.current.delete(m.id);
                  }}
                >
                  <ChatMessage
                    message={m}
                    isMine={m.author.id === appUser?.id}
                    onReply={setReplyingTo}
                    canDelete={m.author.id === appUser?.id || myRole === "ADMIN"}
                    onDeleted={(messageId) => setMessages((cur) => cur?.filter((msg) => msg.id !== messageId) ?? null)}
                  />
                </div>
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
        isVerified={group.isVerified}
        verificationRequestedAt={group.verificationRequestedAt}
        onSettingsChanged={(patch) => setGroup((cur) => (cur ? { ...cur, ...(patch as Partial<GroupDetail>) } : cur))}
        onDeleted={() => router.push("/socials?tab=fanbase")}
      />

      {photoFile && (
        <ImageCropModal
          file={photoFile}
          aspect={1}
          cropShape="round"
          outputWidth={512}
          outputHeight={512}
          onCancel={() => setPhotoFile(null)}
          onConfirm={handlePhotoConfirm}
        />
      )}
    </div>
  );
}
