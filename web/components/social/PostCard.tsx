"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { ReportButton } from "@/components/trust/ReportButton";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { FollowButton } from "@/components/profile/FollowButton";
import { Linkified } from "@/components/ui/Linkified";
import { useToast } from "@/components/ui/ToastProvider";

export type FeedPost = {
  id: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  author: { id: string; handle: string; displayName: string; avatarUrl: string | null; isVerified?: boolean };
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  followedByMe?: boolean;
};

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  author: { handle: string; displayName: string; avatarUrl: string | null };
};

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

export function PostCard({ post, onDeleted }: { post: FeedPost; onDeleted?: (postId: string) => void }) {
  const { appUser } = useAuth();
  const toast = useToast();
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  async function toggleComments() {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next && comments === null) {
      const res = await apiFetch(`/api/posts/${post.id}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments);
      } else {
        toast.error("Couldn't load comments.");
      }
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = commentBody.trim();
    if (!trimmed) return;
    setPostingComment(true);
    try {
      const res = await apiFetch(`/api/posts/${post.id}/comments`, { method: "POST", body: JSON.stringify({ body: trimmed }) });
      if (res.ok) {
        const data = await res.json();
        setComments((cur) => [...(cur ?? []), data.comment]);
        setCommentCount((c) => c + 1);
        setCommentBody("");
      } else {
        toast.error("Couldn't post your comment. Try again.");
      }
    } finally {
      setPostingComment(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this post?")) return;
    setDeleting(true);
    const res = await apiFetch(`/api/posts/${post.id}`, { method: "DELETE" });
    if (res.ok) onDeleted?.(post.id);
    else {
      setDeleting(false);
      toast.error("Couldn't delete this post. Try again.");
    }
  }

  async function toggleLike() {
    if (busy) return;
    setBusy(true);
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((c) => c + (nextLiked ? 1 : -1));
    try {
      const res = await apiFetch(`/api/posts/${post.id}/like`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.liked);
        setLikeCount(data.likeCount);
      } else {
        setLiked(!nextLiked);
        setLikeCount((c) => c + (nextLiked ? -1 : 1));
        toast.error("Couldn't update like. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-red/15 bg-red/10 px-4 py-4">
      <div className="flex items-center gap-2.5 mb-2.5">
        <Link href={`/u/${post.author.handle}`} className="relative h-8 w-8 rounded-full bg-surface-2 overflow-hidden shrink-0">
          {post.author.avatarUrl && (
            <Image src={post.author.avatarUrl} alt={post.author.displayName} fill sizes="32px" className="object-cover" />
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/u/${post.author.handle}`} className="flex items-center gap-1 text-sm font-semibold">
            <span className="line-clamp-1">{post.author.displayName}</span>
            {post.author.isVerified && <VerifiedBadge />}
          </Link>
          <p className="text-[12px] text-ink-3">{timeAgo(post.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {appUser?.id !== post.author.id && (
            <FollowButton targetUserId={post.author.id} size="compact" initialFollowing={post.followedByMe} />
          )}
          {appUser?.id === post.author.id ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="text-[12px] text-ink-3 shrink-0 disabled:opacity-50"
            >
              Delete
            </button>
          ) : (
            <ReportButton targetType="POST" targetId={post.id} ownerId={post.author.id} className="text-[12px] text-ink-3 shrink-0" />
          )}
        </div>
      </div>
      <p className="text-sm text-ink-2 whitespace-pre-wrap mb-3">
        <Linkified text={post.body} linkClassName="underline text-red-soft" />
      </p>
      {post.imageUrl && (
        <div className="relative w-full aspect-square rounded-lg overflow-hidden mb-3 bg-surface-2">
          <Image src={post.imageUrl} alt="" fill sizes="100vw" className="object-cover" />
        </div>
      )}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggleLike}
          className={`flex items-center gap-1.5 text-xs ${liked ? "text-red-soft" : "text-ink-3"}`}
          aria-label={liked ? "Unlike" : "Like"}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6">
            <path d="M12 20s-7-4.4-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.6-7 9-7 9z" strokeLinejoin="round" />
          </svg>
          {likeCount.toLocaleString("en-NG")}
        </button>
        <button type="button" onClick={toggleComments} className="flex items-center gap-1.5 text-xs text-ink-3">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 5h16v11H8l-4 4V5z" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          {commentCount > 0 ? commentCount.toLocaleString("en-NG") : "Comment"}
        </button>
      </div>

      {commentsOpen && (
        <div className="mt-3 flex flex-col gap-3">
          {comments === null ? (
            <p className="text-xs text-ink-3">Loading…</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-2">
                <Link href={`/u/${c.author.handle}`} className="relative h-6 w-6 rounded-full bg-surface-2 overflow-hidden shrink-0">
                  {c.author.avatarUrl && (
                    <Image src={c.author.avatarUrl} alt={c.author.displayName} fill sizes="24px" className="object-cover" />
                  )}
                </Link>
                <div className="min-w-0">
                  <p className="text-xs">
                    <Link href={`/u/${c.author.handle}`} className="font-semibold mr-1.5">
                      {c.author.displayName}
                    </Link>
                    <Linkified text={c.body} />
                  </p>
                  <p className="text-[11px] text-ink-3">{timeAgo(c.createdAt)}</p>
                </div>
              </div>
            ))
          )}
          <form onSubmit={handleAddComment} className="flex items-center gap-2">
            <input
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value.slice(0, 500))}
              placeholder="Add a comment…"
              className="flex-1 rounded-full border border-line bg-surface px-3.5 py-2 text-xs outline-none focus:border-red"
            />
            <button
              type="submit"
              disabled={postingComment || !commentBody.trim()}
              className="text-xs font-semibold text-red-soft disabled:opacity-40"
            >
              Post
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
