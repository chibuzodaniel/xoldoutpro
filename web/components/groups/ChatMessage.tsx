"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Linkified } from "@/components/ui/Linkified";

export type ChatMessageData = {
  id: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  author: { id: string; handle: string; displayName: string; avatarUrl: string | null; isVerified: boolean };
  replyTo: { id: string; body: string; author: { displayName: string } } | null;
  likeCount: number;
  likedByMe: boolean;
  poll: { options: string[]; counts: number[]; myVote: number | null; totalVotes: number } | null;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function PollBlock({ messageId, poll, onVoted }: { messageId: string; poll: ChatMessageData["poll"]; onVoted: (p: ChatMessageData["poll"]) => void }) {
  const [busy, setBusy] = useState(false);
  if (!poll) return null;

  async function vote(optionIndex: number) {
    if (busy || poll!.myVote === optionIndex) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/posts/${messageId}/poll/vote`, { method: "POST", body: JSON.stringify({ optionIndex }) });
      if (res.ok) {
        const data = await res.json();
        onVoted({ options: poll!.options, counts: data.counts, myVote: data.myVote, totalVotes: data.totalVotes });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {poll.options.map((option, i) => {
        const pct = poll.totalVotes > 0 ? Math.round((poll.counts[i] / poll.totalVotes) * 100) : 0;
        const mine = poll.myVote === i;
        return (
          <button
            key={i}
            type="button"
            onClick={() => vote(i)}
            disabled={busy}
            className="relative w-full overflow-hidden rounded-lg border border-white/15 text-left disabled:opacity-80"
          >
            <div className={`absolute inset-y-0 left-0 ${mine ? "bg-white/25" : "bg-white/5"}`} style={{ width: poll.myVote !== null ? `${pct}%` : "0%" }} />
            <div className="relative flex items-center justify-between px-2.5 py-1.5">
              <span className="text-xs">{option}</span>
              {poll.myVote !== null && <span className="text-[12px] opacity-80">{pct}%</span>}
            </div>
          </button>
        );
      })}
      <p className="text-[11px] opacity-70">{poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}</p>
    </div>
  );
}

// A single chat entry — right-aligned/solid for the current user's own
// messages, left-aligned/avatar-led for everyone else's (image9 reference).
// The quoted "replyTo" strip renders inline above the bubble, matching the
// nested-reply visual in that same reference.
export function ChatMessage({
  message,
  isMine,
  onReply,
  canDelete,
  onDeleted,
}: {
  message: ChatMessageData;
  isMine: boolean;
  onReply: (message: ChatMessageData) => void;
  canDelete?: boolean;
  onDeleted?: (messageId: string) => void;
}) {
  const [liked, setLiked] = useState(message.likedByMe);
  const [likeCount, setLikeCount] = useState(message.likeCount);
  const [poll, setPoll] = useState(message.poll);
  const [deleting, setDeleting] = useState(false);

  async function toggleLike() {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    const res = await apiFetch(`/api/posts/${message.id}/like`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setLiked(data.liked);
      setLikeCount(data.likeCount);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this message?")) return;
    setDeleting(true);
    const res = await apiFetch(`/api/posts/${message.id}`, { method: "DELETE" });
    if (res.ok) onDeleted?.(message.id);
    else setDeleting(false);
  }

  return (
    <div className={`flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
      {!isMine && (
        <div className="h-8 w-8 rounded-full bg-red/20 text-red-soft flex items-center justify-center text-[11px] font-bold shrink-0">
          {initials(message.author.displayName)}
        </div>
      )}
      <div className={`flex flex-col max-w-[78%] ${isMine ? "items-end" : "items-start"}`}>
        {!isMine && (
          <p className="text-[12px] font-semibold text-red-soft mb-0.5 flex items-center gap-1">
            {message.author.displayName}
          </p>
        )}
        {message.replyTo && (
          <div className={`mb-1 rounded-lg border-l-2 border-red-soft/60 bg-white/5 px-2.5 py-1.5 max-w-full`}>
            <p className="text-[11px] font-semibold text-red-soft">{message.replyTo.author.displayName}</p>
            <p className="text-[12px] text-ink-3 line-clamp-1">{message.replyTo.body}</p>
          </div>
        )}
        <div
          onDoubleClick={() => onReply(message)}
          className={`select-none rounded-2xl px-3.5 py-2.5 ${isMine ? "bg-red text-white" : "bg-surface-2 text-ink"}`}
        >
          <p className="text-sm whitespace-pre-wrap">
            <Linkified text={message.body} />
          </p>
          {message.imageUrl && (
            <div className="rounded-lg overflow-hidden mt-2 max-w-[220px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={message.imageUrl} alt="" className="w-full object-cover" />
            </div>
          )}
          <PollBlock messageId={message.id} poll={poll} onVoted={setPoll} />
        </div>
        <div className="flex items-center gap-3 mt-1 px-1">
          <span className="text-[11px] text-ink-3">{timeAgo(message.createdAt)} ago</span>
          <button type="button" onClick={() => onReply(message)} className="text-[11px] text-ink-3 font-semibold">
            Reply
          </button>
          <button type="button" onClick={toggleLike} className={`text-[11px] font-semibold ${liked ? "text-red-soft" : "text-ink-3"}`}>
            ♥ {likeCount > 0 ? likeCount : ""}
          </button>
          {canDelete && (
            <button type="button" onClick={handleDelete} disabled={deleting} className="text-[11px] text-ink-3 font-semibold disabled:opacity-50">
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
