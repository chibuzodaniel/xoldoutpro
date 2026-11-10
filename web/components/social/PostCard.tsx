"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { ReportButton } from "@/components/trust/ReportButton";
import { VerifiedBadge, primaryBadgeType } from "@/components/profile/VerifiedBadge";
import { FollowButton } from "@/components/profile/FollowButton";
import { Linkified } from "@/components/ui/Linkified";
import { useToast } from "@/components/ui/ToastProvider";
import { ArtworkImage } from "@/components/ui/ArtworkImage";

export type FeedPost = {
  id: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  author: {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    isVerified?: boolean;
    verificationBadges?: string[];
  };
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  followedByMe?: boolean;
  // Socials v2 (design/v2-prototype).
  audience?: "EVERYONE" | "FOLLOWERS" | string;
  repostCount?: number;
  repostedByMe?: boolean;
  attachment?: { kind: string; id: string; title: string; subtitle: string; priceKobo: number | null; imageUrl: string | null; href: string } | null;
  repostOf?: FeedPost | null;
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

const DOUBLE_TAP_WINDOW_MS = 300;

// Fires once per double-tap-to-like: pops in at the tap point, then flies
// down into the like button and fades out — the Instagram/X-style
// confirmation that the double-tap actually registered. Positioned via
// `position: fixed` (viewport coordinates from the tap/click event and the
// button's getBoundingClientRect), so it isn't clipped by the image
// container's own `overflow-hidden`. Two-step transform (base position on
// mount, "flying" position one frame later) is what makes the CSS
// transition actually animate instead of snapping straight to the end state.
function FlyingHeart({ startX, startY, dx, dy, onDone }: { startX: number; startY: number; dx: number; dy: number; onDone: () => void }) {
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setFlying(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <span
      onTransitionEnd={onDone}
      className="fixed z-50 text-4xl pointer-events-none transition-all duration-700 ease-out"
      style={{
        left: startX,
        top: startY,
        transform: flying ? `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.35)` : "translate(-50%, -50%) scale(1.2)",
        opacity: flying ? 0 : 1,
      }}
    >
      ❤️
    </span>
  );
}

export function PostCard({
  post,
  onDeleted,
  repostedBy,
}: {
  post: FeedPost;
  onDeleted?: (postId: string) => void;
  /** Shown as "<name> reposted" above the original post. */
  repostedBy?: { handle: string; displayName: string } | null;
}) {
  const { appUser } = useAuth();
  const toast = useToast();
  const [reposted, setReposted] = useState(Boolean(post.repostedByMe));
  const [repostCount, setRepostCount] = useState(post.repostCount ?? 0);
  const [reposting, setReposting] = useState(false);

  async function toggleRepost() {
    if (reposting) return;
    if (!reposted && post.audience === "FOLLOWERS") return toast.error("Followers-only posts can't be reposted");
    setReposting(true);
    const res = await apiFetch(`/api/posts/${post.id}/repost`, { method: "POST" }).catch(() => null);
    setReposting(false);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      return toast.error(typeof d.error === "string" ? d.error : "Couldn't repost");
    }
    const d = await res.json();
    setReposted(d.reposted);
    setRepostCount(d.repostCount);
    toast.success(d.reposted ? "You reposted" : "Repost removed");
  }

  async function sharePost() {
    const url = `${window.location.origin}${post.attachment?.href ?? `/u/${post.author.handle}`}`;
    const text = `${post.author.displayName} on XOLDOUT: ${post.body.slice(0, 140)}`;
    try {
      if (navigator.share) await navigator.share({ title: "XOLDOUT", text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast.success("Link copied");
      }
    } catch {
      // dismissed
    }
  }
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [flyingHeart, setFlyingHeart] = useState<{ key: number; startX: number; startY: number; dx: number; dy: number } | null>(null);
  const lastTapRef = useRef(0);
  const likeButtonRef = useRef<HTMLButtonElement>(null);

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
    if (!await toast.confirm("Delete this post?", { confirmLabel: "Delete", destructive: true })) return;
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

  // Double-tap on the photo (or, for a text-only post, the body) toggles
  // like the same as tapping the heart button — Instagram/X-style gesture.
  // A second double-tap unlikes, matching the explicit ask (unlike
  // Instagram, which only ever likes on double-tap and needs the button for
  // the reverse). Manual timestamp-based detection rather than
  // `onDoubleClick` so touch taps and desktop clicks behave identically and
  // this can capture the tap coordinates for the fly-to-button animation.
  function handleDoubleTapLike(e: React.MouseEvent) {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < DOUBLE_TAP_WINDOW_MS;
    lastTapRef.current = isDoubleTap ? 0 : now;
    if (!isDoubleTap) return;

    // Only the like transition gets the flying heart — double-tapping an
    // already-liked post to unlike it stays silent, same as tapping the
    // button to unlike never shows one either.
    if (!liked) {
      const btnRect = likeButtonRef.current?.getBoundingClientRect();
      if (btnRect) {
        const endX = btnRect.left + btnRect.width / 2;
        const endY = btnRect.top + btnRect.height / 2;
        setFlyingHeart({ key: Date.now(), startX: e.clientX, startY: e.clientY, dx: endX - e.clientX, dy: endY - e.clientY });
      }
    }
    toggleLike();
  }

  return (
    <div className="rounded-2xl border border-red/15 bg-red/10 px-4 py-4">
      {repostedBy && (
        <Link href={`/u/${repostedBy.handle}`} className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink-3">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {repostedBy.handle === appUser?.handle ? "You reposted" : `${repostedBy.displayName} reposted`}
        </Link>
      )}
      <div className="flex items-center gap-2.5 mb-2.5">
        <Link href={`/u/${post.author.handle}`} className="relative h-8 w-8 rounded-full bg-surface-2 overflow-hidden shrink-0">
          <ArtworkImage src={post.author.avatarUrl} alt={post.author.displayName} sizes="32px" className="object-cover" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/u/${post.author.handle}`} className="flex items-center gap-1 text-sm font-semibold">
            <span className="line-clamp-1">{post.author.displayName}</span>
            {post.author.isVerified && <VerifiedBadge badgeType={primaryBadgeType(post.author.verificationBadges)} />}
          </Link>
          <p className="text-[12px] text-ink-3">
            {timeAgo(post.createdAt)}
            {post.audience === "FOLLOWERS" ? " · Followers only" : ""}
          </p>
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
      <p
        className="text-sm text-ink-2 whitespace-pre-wrap mb-3"
        onClick={post.imageUrl ? undefined : handleDoubleTapLike}
      >
        <Linkified text={post.body} linkClassName="underline text-red-soft" />
      </p>
      {post.imageUrl && (
        <div
          onClick={handleDoubleTapLike}
          className="relative w-full aspect-square rounded-lg overflow-hidden mb-3 bg-surface-2 select-none"
        >
          <ArtworkImage src={post.imageUrl} alt="" sizes="100vw" className="object-cover" />
        </div>
      )}
      {post.attachment && (
        <Link href={post.attachment.href} className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5">
          <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-red/50 to-black">
            {post.attachment.imageUrl && <ArtworkImage src={post.attachment.imageUrl} alt="" sizes="56px" className="object-cover" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-red-soft">
              {post.attachment.kind === "RELEASE" ? "Music" : post.attachment.kind === "BEAT" ? "Beat" : post.attachment.kind === "MERCH" ? "Merch" : "Event"}
            </span>
            <span className="block truncate text-sm font-bold">{post.attachment.title}</span>
            <span className="block truncate text-[12px] text-ink-3">
              {post.attachment.subtitle}
              {post.attachment.priceKobo != null ? ` · ${post.attachment.priceKobo === 0 ? "Free" : `₦${(post.attachment.priceKobo / 100).toLocaleString("en-NG")}`}` : ""}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-red px-3 py-1.5 text-[12px] font-bold text-white">View</span>
        </Link>
      )}
      <div className="flex items-center gap-4">
        <button
          ref={likeButtonRef}
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
        <button
          type="button"
          onClick={toggleRepost}
          disabled={reposting}
          aria-pressed={reposted}
          aria-label="Repost"
          className={`flex items-center gap-1.5 text-xs ${reposted ? "text-red-soft" : "text-ink-3"}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {repostCount > 0 ? repostCount.toLocaleString("en-NG") : "Repost"}
        </button>
        <button type="button" onClick={sharePost} aria-label="Share post" className="ml-auto flex items-center text-xs text-ink-3">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="18" cy="5" r="2.5" />
            <circle cx="6" cy="12" r="2.5" />
            <circle cx="18" cy="19" r="2.5" />
            <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
          </svg>
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
                  <ArtworkImage src={c.author.avatarUrl} alt={c.author.displayName} sizes="24px" className="object-cover" />
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

      {flyingHeart && (
        <FlyingHeart
          key={flyingHeart.key}
          startX={flyingHeart.startX}
          startY={flyingHeart.startY}
          dx={flyingHeart.dx}
          dy={flyingHeart.dy}
          onDone={() => setFlyingHeart(null)}
        />
      )}
    </div>
  );
}
