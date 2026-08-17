"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { ReportButton } from "@/components/trust/ReportButton";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";

export type FeedPost = {
  id: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  author: { id: string; handle: string; displayName: string; avatarUrl: string | null; isVerified?: boolean };
  likeCount: number;
  likedByMe: boolean;
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

export function PostCard({ post }: { post: FeedPost }) {
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [busy, setBusy] = useState(false);

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
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-line-soft py-4">
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
          <p className="text-[11px] text-ink-3">{timeAgo(post.createdAt)}</p>
        </div>
        <ReportButton targetType="POST" targetId={post.id} ownerId={post.author.id} className="text-[11px] text-ink-3 shrink-0" />
      </div>
      <p className="text-sm text-ink-2 whitespace-pre-wrap mb-3">{post.body}</p>
      {post.imageUrl && (
        <div className="relative w-full aspect-square rounded-lg overflow-hidden mb-3 bg-surface-2">
          <Image src={post.imageUrl} alt="" fill sizes="100vw" className="object-cover" />
        </div>
      )}
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
    </div>
  );
}
