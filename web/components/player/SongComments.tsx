"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { Linkified } from "@/components/ui/Linkified";
import { ArtworkImage } from "@/components/ui/ArtworkImage";

// YouTube-style song comments under the expanded player (explicit ask,
// 2026-11-04). Loaded once when the Comments tab is shown for a song — no
// polling (web/CLAUDE.md CPU budget). API: app/api/song-comments/*.

type Author = { id: string; handle: string; displayName: string; avatarUrl: string | null };
type SongComment = {
  id: string;
  body: string;
  createdAt: string;
  likeCount: number;
  replyCount: number;
  parentId: string | null;
  author: Author;
  myVote: number;
};

function timeAgo(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const units: [number, string][] = [
    [31536000, "year"],
    [2592000, "month"],
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [size, name] of units) {
    const n = Math.floor(seconds / size);
    if (n >= 1) return `${n} ${name}${n > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

function compact(n: number) {
  return n >= 1000 ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n) : String(n);
}

function ThumbIcon({ down, filled }: { down?: boolean; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-[18px] w-[18px] ${down ? "rotate-180" : ""}`} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7">
      <path d="M7 10v11H4a1 1 0 01-1-1v-9a1 1 0 011-1h3z" strokeLinejoin="round" />
      <path d="M7 10l4-7a2 2 0 012.9 2.2L13 10h6.2a2 2 0 012 2.3l-1.3 7A2 2 0 0117.9 21H7" strokeLinejoin="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 3L10 14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 3l-7 18-4-7-7-4 18-7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Avatar({ author, size }: { author: Pick<Author, "displayName" | "avatarUrl"> | null; size: number }) {
  return (
    <span className="relative block rounded-full bg-surface-2 overflow-hidden shrink-0" style={{ width: size, height: size }}>
      {author?.avatarUrl ? (
        <ArtworkImage src={author.avatarUrl} alt={author.displayName} sizes={`${size}px`} className="object-cover" />
      ) : (
        <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full text-ink-3" fill="currentColor">
          <circle cx="12" cy="9" r="4" />
          <path d="M4 21a8 8 0 0116 0z" />
        </svg>
      )}
    </span>
  );
}

/** The "Share your thoughts…" bar: avatar, rounded input, red send button. */
function Composer({
  placeholder,
  initial = "",
  autoFocus,
  compactSize,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  initial?: string;
  autoFocus?: boolean;
  compactSize?: boolean;
  onSubmit: (body: string) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const { appUser } = useAuth();
  const [body, setBody] = useState(initial);
  const [posting, setPosting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    const ok = await onSubmit(trimmed);
    setPosting(false);
    if (ok) setBody("");
  }

  if (!appUser) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`}
        className="flex items-center gap-3 rounded-full border border-line px-2 py-2 text-sm text-ink-3"
      >
        <Avatar author={null} size={compactSize ? 28 : 34} />
        Sign in to share your thoughts…
      </Link>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex items-center gap-3 rounded-full border border-line pl-2 pr-1.5 py-1.5 focus-within:border-ink-3">
        <Avatar author={appUser} size={compactSize ? 28 : 34} />
        <input
          value={body}
          autoFocus={autoFocus}
          onChange={(e) => setBody(e.target.value.slice(0, 1000))}
          onKeyDown={(e) => e.key === "Escape" && onCancel?.()}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-ink-3"
        />
        <button
          type="submit"
          disabled={posting || !body.trim()}
          aria-label="Post comment"
          className={`flex items-center justify-center rounded-full bg-red text-white disabled:opacity-40 ${compactSize ? "h-8 w-8" : "h-9 w-9"}`}
        >
          <SendIcon />
        </button>
      </div>
      {onCancel && (
        <button type="button" onClick={onCancel} className="self-end text-xs text-ink-3 px-2">
          Cancel
        </button>
      )}
    </form>
  );
}

function CommentRow({
  comment,
  creatorId,
  canDeleteAll,
  isReply,
  onVote,
  onReply,
  onDelete,
}: {
  comment: SongComment;
  creatorId: string | null;
  canDeleteAll: boolean;
  isReply?: boolean;
  onVote: (c: SongComment, value: number) => void;
  onReply: (c: SongComment) => void;
  onDelete: (c: SongComment) => void;
}) {
  const { appUser } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const long = comment.body.length > 220 || comment.body.split("\n").length > 4;
  const isCreator = comment.author.id === creatorId;
  const canDelete = canDeleteAll || appUser?.id === comment.author.id;

  return (
    <div className="flex gap-3">
      <Link href={`/u/${comment.author.handle}`}>
        <Avatar author={comment.author} size={isReply ? 26 : 36} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12px] text-ink-3 truncate">
            <Link
              href={`/u/${comment.author.handle}`}
              className={isCreator ? "rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-ink" : "font-semibold text-ink-2"}
            >
              @{comment.author.handle}
              {isCreator && " ♪"}
            </Link>
            <span className="ml-1.5">· {timeAgo(comment.createdAt)}</span>
          </p>
          {canDelete && (
            <div className="relative shrink-0">
              <button onClick={() => setMenuOpen((v) => !v)} className="text-ink-3 px-1 leading-none" aria-label="More">
                ⋮
              </button>
              {menuOpen && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(comment);
                  }}
                  className="absolute right-0 top-5 z-10 rounded-md border border-line bg-surface px-3 py-2 text-xs text-red-soft whitespace-nowrap"
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
        <p className={`mt-0.5 text-sm text-ink whitespace-pre-line break-words ${!expanded && long ? "line-clamp-4" : ""}`}>
          <Linkified text={comment.body} />
        </p>
        {long && (
          <button onClick={() => setExpanded((v) => !v)} className="text-[12px] font-semibold text-ink-3 mt-0.5">
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
        <div className="mt-1.5 flex items-center gap-4 text-ink-2">
          <button
            onClick={() => onVote(comment, comment.myVote === 1 ? 0 : 1)}
            className={`flex items-center gap-1.5 text-[12px] ${comment.myVote === 1 ? "text-ink" : ""}`}
            aria-label="Like"
            aria-pressed={comment.myVote === 1}
          >
            <ThumbIcon filled={comment.myVote === 1} />
            {comment.likeCount > 0 && compact(comment.likeCount)}
          </button>
          <button
            onClick={() => onVote(comment, comment.myVote === -1 ? 0 : -1)}
            className={comment.myVote === -1 ? "text-ink" : ""}
            aria-label="Dislike"
            aria-pressed={comment.myVote === -1}
          >
            <ThumbIcon down filled={comment.myVote === -1} />
          </button>
          <button onClick={() => onReply(comment)} className="text-[12px] font-semibold text-ink-2">
            Reply
          </button>
        </div>
      </div>
    </div>
  );
}

function Thread({
  comment,
  kind,
  trackId,
  creatorId,
  canDeleteAll,
  onVote,
  onDeleted,
}: {
  comment: SongComment;
  kind: "track" | "beat";
  trackId: string;
  creatorId: string | null;
  canDeleteAll: boolean;
  onVote: (c: SongComment, value: number) => void;
  onDeleted: (c: SongComment) => void;
}) {
  const toast = useToast();
  const { appUser } = useAuth();
  const [replies, setReplies] = useState<SongComment[] | null>(null);
  const [open, setOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<SongComment | null>(null);
  const replyCount = replies ? replies.length : comment.replyCount;

  async function loadReplies() {
    const res = await apiFetch(`/api/song-comments/${comment.id}/replies`);
    if (!res.ok) return toast.error("Couldn't load replies.");
    setReplies((await res.json()).replies);
  }

  async function toggleReplies() {
    const next = !open;
    setOpen(next);
    if (next && replies === null) await loadReplies();
  }

  async function postReply(body: string) {
    const res = await apiFetch(`/api/song-comments`, {
      method: "POST",
      body: JSON.stringify({ kind, trackId, body, parentId: replyTo?.id ?? comment.id }),
    });
    if (!res.ok) {
      toast.error("Couldn't post your reply. Try again.");
      return false;
    }
    const { comment: created } = await res.json();
    setReplies((cur) => [...(cur ?? []), created]);
    if (replies === null) await loadReplies();
    setOpen(true);
    setReplyTo(null);
    return true;
  }

  function voteReply(c: SongComment, value: number) {
    onVote(c, value);
    if (!appUser) return;
    // Optimistic copy for the local replies list; the parent list owns top-level rows.
    setReplies((cur) =>
      cur?.map((r) =>
        r.id === c.id ? { ...r, myVote: value, likeCount: Math.max(0, r.likeCount + (value === 1 ? 1 : 0) - (r.myVote === 1 ? 1 : 0)) } : r,
      ) ?? cur,
    );
  }

  async function deleteReply(c: SongComment) {
    const res = await apiFetch(`/api/song-comments/${c.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't delete that reply.");
    setReplies((cur) => cur?.filter((r) => r.id !== c.id) ?? cur);
  }

  const replyPrefill = replyTo && replyTo.id !== comment.id && replyTo.author.id !== appUser?.id ? `@${replyTo.author.handle} ` : "";

  return (
    <div>
      <CommentRow
        comment={{ ...comment, replyCount }}
        creatorId={creatorId}
        canDeleteAll={canDeleteAll}
        onVote={onVote}
        onReply={(c) => setReplyTo(c)}
        onDelete={onDeleted}
      />
      <div className="pl-12">
        {replyTo && (
          <div className="mt-3">
            <Composer key={replyTo.id} compactSize autoFocus initial={replyPrefill} placeholder="Add a reply…" onSubmit={postReply} onCancel={() => setReplyTo(null)} />
          </div>
        )}
        {replyCount > 0 && (
          <button onClick={toggleReplies} className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-red-soft">
            <span className={`inline-block transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
            {replyCount} {replyCount === 1 ? "reply" : "replies"}
          </button>
        )}
        {open && (
          <div className="mt-3 flex flex-col gap-4">
            {replies === null ? (
              <p className="text-xs text-ink-3">Loading…</p>
            ) : (
              replies.map((r) => (
                <CommentRow
                  key={r.id}
                  comment={r}
                  isReply
                  creatorId={creatorId}
                  canDeleteAll={canDeleteAll}
                  onVote={voteReply}
                  onReply={(c) => setReplyTo(c)}
                  onDelete={deleteReply}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function SongComments({
  kind,
  trackId,
  listVisible,
  onPosted,
}: {
  kind: "track" | "beat";
  trackId: string;
  /** false while the Lyrics tab is showing: only the composer renders. */
  listVisible: boolean;
  onPosted?: () => void;
}) {
  const toast = useToast();
  const { appUser } = useAuth();
  const [sort, setSort] = useState<"top" | "new">("top");
  const [comments, setComments] = useState<SongComment[] | null>(null);
  const [total, setTotal] = useState(0);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedKey = useRef<string | null>(null);

  const load = useCallback(
    async (offset: number) => {
      const qs = new URLSearchParams({ kind, trackId, sort, offset: String(offset) });
      const res = await apiFetch(`/api/song-comments?${qs}`);
      if (!res.ok) {
        if (offset === 0) setComments([]);
        return;
      }
      const data = await res.json();
      setComments((cur) => (offset === 0 ? data.comments : [...(cur ?? []), ...data.comments]));
      setNextOffset(data.nextOffset);
      if (offset === 0) {
        setTotal(data.total ?? 0);
        setCreatorId(data.creatorId ?? null);
      }
    },
    [kind, trackId, sort],
  );

  // Fetch once per song + sort, and only once the list is actually on screen.
  useEffect(() => {
    const key = `${kind}:${trackId}:${sort}`;
    if (!listVisible || loadedKey.current === key) return;
    loadedKey.current = key;
    setComments(null);
    load(0);
  }, [kind, trackId, sort, listVisible, load]);

  async function postComment(body: string) {
    const res = await apiFetch(`/api/song-comments`, { method: "POST", body: JSON.stringify({ kind, trackId, body }) });
    if (!res.ok) {
      toast.error(res.status === 401 ? "Sign in to comment." : "Couldn't post your comment. Try again.");
      return false;
    }
    const { comment } = await res.json();
    setComments((cur) => [comment, ...(cur ?? [])]);
    setTotal((t) => t + 1);
    onPosted?.();
    return true;
  }

  async function vote(c: SongComment, value: number) {
    if (!appUser) return toast.error("Sign in to like comments.");
    const before = c;
    const optimistic = { myVote: value, likeCount: Math.max(0, c.likeCount + (value === 1 ? 1 : 0) - (c.myVote === 1 ? 1 : 0)) };
    setComments((cur) => cur?.map((x) => (x.id === c.id ? { ...x, ...optimistic } : x)) ?? cur);
    const res = await apiFetch(`/api/song-comments/${c.id}/vote`, { method: "POST", body: JSON.stringify({ value }) });
    if (!res.ok) {
      setComments((cur) => cur?.map((x) => (x.id === c.id ? { ...x, myVote: before.myVote, likeCount: before.likeCount } : x)) ?? cur);
      toast.error("Couldn't save that. Try again.");
    }
  }

  async function remove(c: SongComment) {
    const res = await apiFetch(`/api/song-comments/${c.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't delete that comment.");
    setComments((cur) => cur?.filter((x) => x.id !== c.id) ?? cur);
    setTotal((t) => Math.max(0, t - 1 - c.replyCount));
  }

  async function loadMore() {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    await load(nextOffset);
    setLoadingMore(false);
  }

  const canDeleteAll = !!appUser && (appUser.isModerator || appUser.id === creatorId);

  return (
    <div className="flex flex-col gap-5">
      <Composer placeholder="Share your thoughts…" onSubmit={postComment} />

      {listVisible && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">
              Comments <span className="text-ink-3 font-normal ml-1">{compact(total)}</span>
            </p>
            <div className="flex gap-2">
              {(["top", "new"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`rounded-lg px-3 py-1 text-[12px] font-semibold ${sort === s ? "bg-ink text-bg" : "bg-surface-2 text-ink-2"}`}
                >
                  {s === "top" ? "Top" : "Newest"}
                </button>
              ))}
            </div>
          </div>

          {comments === null ? (
            <p className="text-xs text-ink-3 text-center py-4">Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-ink-3 text-center py-4">No comments yet. Be the first to share your thoughts.</p>
          ) : (
            <div className="flex flex-col gap-5">
              {comments.map((c) => (
                <Thread
                  key={c.id}
                  comment={c}
                  kind={kind}
                  trackId={trackId}
                  creatorId={creatorId}
                  canDeleteAll={canDeleteAll}
                  onVote={vote}
                  onDeleted={remove}
                />
              ))}
              {nextOffset !== null && (
                <button onClick={loadMore} disabled={loadingMore} className="text-[13px] font-semibold text-ink-2 py-2 disabled:opacity-50">
                  {loadingMore ? "Loading…" : "Show more comments"}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
