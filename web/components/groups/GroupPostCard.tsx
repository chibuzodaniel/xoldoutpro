"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";

export type GroupPost = {
  id: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  author: { id: string; handle: string; displayName: string; avatarUrl: string | null; isVerified: boolean };
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  poll: { options: string[]; counts: number[]; myVote: number | null; totalVotes: number } | null;
};

type Comment = { id: string; body: string; createdAt: string; author: { handle: string; displayName: string; avatarUrl: string | null } };

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Proportional result bars per PRD §11 Phase 2.
function PollBlock({ postId, poll, onVoted }: { postId: string; poll: GroupPost["poll"]; onVoted: (poll: GroupPost["poll"]) => void }) {
  const [busy, setBusy] = useState(false);
  if (!poll) return null;

  async function vote(optionIndex: number) {
    if (busy || poll!.myVote === optionIndex) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/posts/${postId}/poll/vote`, { method: "POST", body: JSON.stringify({ optionIndex }) });
      if (res.ok) {
        const data = await res.json();
        onVoted({ options: poll!.options, counts: data.counts, myVote: data.myVote, totalVotes: data.totalVotes });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 mb-3">
      {poll.options.map((option, i) => {
        const pct = poll.totalVotes > 0 ? Math.round((poll.counts[i] / poll.totalVotes) * 100) : 0;
        const mine = poll.myVote === i;
        return (
          <button
            key={i}
            type="button"
            onClick={() => vote(i)}
            disabled={busy}
            className="relative w-full overflow-hidden rounded-lg border border-line-soft text-left disabled:opacity-80"
          >
            <div
              className={`absolute inset-y-0 left-0 ${mine ? "bg-red/25" : "bg-surface-2"}`}
              style={{ width: poll.myVote !== null ? `${pct}%` : "0%" }}
            />
            <div className="relative flex items-center justify-between px-3 py-2">
              <span className={`text-sm ${mine ? "font-semibold text-red-soft" : "text-ink-2"}`}>{option}</span>
              {poll.myVote !== null && <span className="text-xs text-ink-3">{pct}%</span>}
            </div>
          </button>
        );
      })}
      <p className="text-[11px] text-ink-3">{poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}</p>
    </div>
  );
}

export function GroupPostCard({ post }: { post: GroupPost }) {
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [poll, setPoll] = useState(post.poll);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function toggleLike() {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    const res = await apiFetch(`/api/posts/${post.id}/like`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setLiked(data.liked);
      setLikeCount(data.likeCount);
    }
  }

  async function loadComments() {
    setShowComments((v) => !v);
    if (comments === null) {
      const res = await apiFetch(`/api/posts/${post.id}/comments`);
      if (res.ok) setComments((await res.json()).comments);
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/posts/${post.id}/comments`, { method: "POST", body: JSON.stringify({ body }) });
      if (res.ok) {
        const data = await res.json();
        setComments((cur) => [...(cur ?? []), data.comment]);
        setCommentCount((c) => c + 1);
        setDraft("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-line-soft py-4">
      <div className="flex items-center gap-2.5 mb-2.5">
        <Link href={`/u/${post.author.handle}`} className="h-8 w-8 rounded-full bg-surface-2 overflow-hidden shrink-0">
          {post.author.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.author.avatarUrl} alt={post.author.displayName} className="h-full w-full object-cover" />
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/u/${post.author.handle}`} className="flex items-center gap-1 text-sm font-semibold">
            <span className="line-clamp-1">{post.author.displayName}</span>
            {post.author.isVerified && <VerifiedBadge />}
          </Link>
          <p className="text-[11px] text-ink-3">{timeAgo(post.createdAt)}</p>
        </div>
      </div>

      <p className="text-sm text-ink-2 whitespace-pre-wrap mb-3">{post.body}</p>

      {post.imageUrl && (
        <div className="rounded-lg overflow-hidden mb-3 bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.imageUrl} alt="" className="w-full aspect-square object-cover" />
        </div>
      )}

      <PollBlock postId={post.id} poll={poll} onVoted={setPoll} />

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggleLike}
          className={`flex items-center gap-1.5 text-xs ${liked ? "text-red-soft" : "text-ink-3"}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6">
            <path d="M12 20s-7-4.4-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.6-7 9-7 9z" strokeLinejoin="round" />
          </svg>
          {likeCount.toLocaleString("en-NG")}
        </button>
        <button type="button" onClick={loadComments} className="flex items-center gap-1.5 text-xs text-ink-3">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 5h16v11H8l-4 4V5z" strokeLinejoin="round" />
          </svg>
          {commentCount}
        </button>
      </div>

      {showComments && (
        <div className="mt-3 pl-2 border-l border-line-soft">
          {comments === null ? (
            <p className="text-xs text-ink-3">Loading…</p>
          ) : (
            <div className="flex flex-col gap-2 mb-2">
              {comments.map((c) => (
                <div key={c.id} className="text-xs">
                  <span className="font-semibold">{c.author.displayName}</span>{" "}
                  <span className="text-ink-2">{c.body}</span>
                </div>
              ))}
              {comments.length === 0 && <p className="text-xs text-ink-3">No comments yet.</p>}
            </div>
          )}
          <form onSubmit={submitComment} className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 500))}
              placeholder="Add a comment…"
              className="flex-1 rounded-lg border border-line bg-transparent px-2.5 py-1.5 text-xs outline-none focus:border-red"
            />
            <button type="submit" disabled={busy || !draft.trim()} className="text-xs font-semibold text-red-soft disabled:opacity-40">
              Post
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
