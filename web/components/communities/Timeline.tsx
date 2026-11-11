"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SongComments } from "@/components/player/SongComments";
import { ReportButton } from "@/components/trust/ReportButton";
import { VerifiedBadge, primaryBadgeType } from "@/components/profile/VerifiedBadge";
import { Linkified } from "@/components/ui/Linkified";
import {
  TIMELINE_KINDS,
  ADMIN_ONLY_KINDS,
  MAX_TIMELINE_MEDIA,
  RSVP_DEFAULT_OPTIONS,
  kindLabel,
  type TimelineMedia,
} from "@/lib/communities/timelineRules";

// Community Timeline (explicit ask, 2026-11-11): the community's private feed
// and noticeboard. Replaces channels. Posting follows the community's Member
// Posting Permissions (enforced on the server); everyone who can read can
// comment, reply, like, vote and RSVP. Loaded page by page — never polled.

type Post = {
  id: string;
  kind: string;
  status: string;
  body: string;
  media: TimelineMedia[];
  pinned: boolean;
  edited: boolean;
  createdAt: string;
  author: { id: string; handle: string; displayName: string; avatarUrl: string | null; isVerified: boolean; verificationBadges: string[]; isAdmin: boolean };
  replyTo: { id: string; body: string; author: { displayName: string } } | null;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  poll: { kind: string; options: string[]; counts: number[]; myVote: number | null; totalVotes: number; closesAt: string | null; closed: boolean } | null;
  mine: boolean;
};
type Viewer = { isAdmin: boolean; publish: "PUBLISHED" | "PENDING" | null; mode: string };

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}
function endsIn(iso: string) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  if (s <= 0) return "Closed";
  if (s < 3600) return `Ends in ${Math.ceil(s / 60)}m`;
  if (s < 86400) return `Ends in ${Math.ceil(s / 3600)}h`;
  return `Ends in ${Math.ceil(s / 86400)}d`;
}

export function Timeline({ communityId }: { communityId: string }) {
  const { appUser } = useAuth();
  const toast = useToast();
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [pending, setPending] = useState<Post[] | null>(null);
  const [showPending, setShowPending] = useState(searchParams.get("review") === "1");
  const [composerOpen, setComposerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const focusId = searchParams.get("post");

  const load = useCallback(
    async (before?: string) => {
      const res = await apiFetch(`/api/communities/${communityId}/timeline${before ? `?before=${encodeURIComponent(before)}` : ""}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setError(typeof d.error === "string" ? d.error : "Couldn't load the Timeline");
      setViewer(d.viewer);
      setNextBefore(d.nextBefore);
      if (!before) setPendingCount(d.pendingCount ?? 0);
      setPosts((cur) => (before ? [...(cur ?? []), ...d.posts.filter((p: Post) => !(cur ?? []).some((c) => c.id === p.id))] : d.posts));
    },
    [communityId],
  );

  useEffect(() => {
    if (!appUser) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first page when the tab opens
    load();
  }, [appUser, load]);

  useEffect(() => {
    if (!showPending || !viewer?.isAdmin || pending) return;
    apiFetch(`/api/communities/${communityId}/timeline/pending`)
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => setPending(d.posts));
  }, [showPending, viewer, pending, communityId]);

  // A shared or notified post: scroll to it once it's on screen.
  useEffect(() => {
    if (!focusId || !posts) return;
    document.getElementById(`tl-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, posts]);

  function replace(p: Post) {
    setPosts((cur) => cur?.map((x) => (x.id === p.id ? p : x)) ?? cur);
  }

  async function decide(p: Post, decision: "APPROVE" | "REJECT") {
    const res = await apiFetch(`/api/communities/${communityId}/timeline/${p.id}`, { method: "PATCH", body: JSON.stringify({ decision }) });
    if (!res.ok) return toast.error("Couldn't save that. Try again.");
    setPending((cur) => cur?.filter((x) => x.id !== p.id) ?? cur);
    setPendingCount((n) => Math.max(0, n - 1));
    toast.success(decision === "APPROVE" ? "Approved — it's on the Timeline" : "Rejected");
    if (decision === "APPROVE") load();
  }

  if (error) return <p className="py-8 text-center text-sm text-ink-3">{error}</p>;
  if (!posts || !viewer) return <p className="py-8 text-center text-sm text-ink-3">Loading the Timeline…</p>;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {viewer.publish ? (
        <button type="button" onClick={() => setComposerOpen(true)} className="flex items-center gap-3 rounded-full border border-white/10 bg-[#111] py-2 pl-2 pr-2 text-left">
          <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- small avatar */}
            {appUser?.avatarUrl && <img src={appUser.avatarUrl} alt="" className="h-full w-full object-cover" />}
          </span>
          <span className="flex-1 truncate text-[15px] text-ink-3">Share something in this community…</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red text-xl font-bold text-white">+</span>
        </button>
      ) : (
        <p className="rounded-2xl border border-white/10 bg-[#111] px-4 py-3 text-[13px] text-ink-3">Only admins post here. You can still comment, reply, like and vote.</p>
      )}

      {viewer.isAdmin && pendingCount > 0 && (
        <div className="rounded-2xl border border-red/40 bg-red/10">
          <button type="button" onClick={() => setShowPending((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold">
            {pendingCount} post{pendingCount === 1 ? "" : "s"} waiting for approval
            <span className="text-red-soft">{showPending ? "Hide" : "Review"}</span>
          </button>
          {showPending && (
            <div className="flex flex-col gap-3 px-3 pb-3">
              {pending === null ? (
                <p className="text-xs text-ink-3">Loading…</p>
              ) : (
                pending.map((p) => (
                  <div key={p.id}>
                    <TimelineCard post={p} communityId={communityId} viewer={viewer} onChange={() => {}} onRemoved={() => {}} preview />
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => decide(p, "APPROVE")} className="flex-1 rounded-full bg-red py-2.5 text-sm font-bold text-white">
                        Approve
                      </button>
                      <button type="button" onClick={() => decide(p, "REJECT")} className="flex-1 rounded-full border border-line py-2.5 text-sm font-semibold">
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {posts.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">Nothing here yet. {viewer.publish ? "Start the conversation." : ""}</p>
      ) : (
        posts.map((p) => (
          <TimelineCard
            key={p.id}
            post={p}
            communityId={communityId}
            viewer={viewer}
            highlight={p.id === focusId}
            onChange={replace}
            onRemoved={(id) => setPosts((cur) => cur?.filter((x) => x.id !== id) ?? cur)}
          />
        ))
      )}
      {nextBefore && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={async () => {
            setLoadingMore(true);
            await load(nextBefore);
            setLoadingMore(false);
          }}
          className="py-3 text-sm font-semibold text-ink-2 disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Show older posts"}
        </button>
      )}

      <Composer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        communityId={communityId}
        viewer={viewer}
        onPosted={(p) => {
          setComposerOpen(false);
          if (p.status === "PENDING") toast.success("Sent to the admins for approval");
          setPosts((cur) => [p, ...(cur ?? []).filter((x) => x.pinned), ...(cur ?? []).filter((x) => !x.pinned)].sort((a, b) => Number(b.pinned) - Number(a.pinned)));
        }}
      />
    </div>
  );
}

function TimelineCard({
  post: p,
  communityId,
  viewer,
  onChange,
  onRemoved,
  highlight,
  preview,
}: {
  post: Post;
  communityId: string;
  viewer: Viewer;
  onChange: (p: Post) => void;
  onRemoved: (id: string) => void;
  highlight?: boolean;
  preview?: boolean;
}) {
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [comments, setComments] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.body);
  const [voting, setVoting] = useState(false);
  const notice = p.kind === "ANNOUNCEMENT" || p.kind === "CAMP_UPDATE" || p.kind === "EVENT_RSVP";
  const canModerate = viewer.isAdmin;

  async function like() {
    const next = !p.likedByMe;
    onChange({ ...p, likedByMe: next, likeCount: p.likeCount + (next ? 1 : -1) });
    const res = await apiFetch(`/api/posts/${p.id}/like`, { method: "POST" }).catch(() => null);
    if (!res?.ok) onChange(p);
  }

  async function vote(i: number) {
    if (!p.poll || p.poll.closed || voting) return;
    setVoting(true);
    try {
      const res = await apiFetch(`/api/posts/${p.id}/poll/vote`, { method: "POST", body: JSON.stringify({ optionIndex: i }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Couldn't vote");
      onChange({ ...p, poll: { ...p.poll, counts: d.counts, totalVotes: d.totalVotes, myVote: d.myVote } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't vote");
    } finally {
      setVoting(false);
    }
  }

  async function patch(body: Record<string, unknown>, ok: string) {
    const res = await apiFetch(`/api/communities/${communityId}/timeline/${p.id}`, { method: "PATCH", body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(typeof d.error === "string" ? d.error : "Couldn't save that");
    onChange(d.post);
    toast.success(ok);
  }

  async function remove() {
    if (!(await toast.confirm("Delete this post?", { confirmLabel: "Delete", destructive: true }))) return;
    const res = await apiFetch(`/api/posts/${p.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't delete it");
    onRemoved(p.id);
    toast.success("Deleted");
  }

  async function share() {
    const url = `${window.location.origin}/groups/${communityId}?post=${p.id}`;
    try {
      if (typeof navigator.share === "function") await navigator.share({ url, text: p.body.slice(0, 120) });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied (members only)");
      }
    } catch {
      // dismissed
    }
  }

  const author = (
    <Link href={`/u/${p.author.handle}`} className="inline-flex items-center gap-1 font-semibold">
      {p.author.displayName}
      {p.author.isVerified && <VerifiedBadge className="h-3.5 w-3.5 shrink-0" badgeType={primaryBadgeType(p.author.verificationBadges)} />}
    </Link>
  );

  return (
    <article id={`tl-${p.id}`} className={`overflow-hidden rounded-2xl border bg-[#111] ${highlight ? "border-red" : "border-white/10"}`}>
      {notice ? (
        <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5 text-[13px]">
          <span className="flex items-center gap-1.5 font-semibold text-red-soft">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M3 10v4a1 1 0 001 1h2l5 4V5L6 9H4a1 1 0 00-1 1zm13.5 2a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z" />
            </svg>
            {kindLabel(p.kind)}
          </span>
          <span className="h-3.5 w-px bg-white/20" />
          <span className="min-w-0 truncate text-ink-3">by {author} · {ago(p.createdAt)}</span>
          <span className="ml-auto flex items-center gap-2">
            {p.pinned && <PinIcon />}
            {!preview && <MenuButton onClick={() => setMenu(true)} />}
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-3 px-4 pt-4">
          <Link href={`/u/${p.author.handle}`} className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-red/50 to-black">
            {/* eslint-disable-next-line @next/next/no-img-element -- small avatar */}
            {p.author.avatarUrl && <img src={p.author.avatarUrl} alt="" className="h-full w-full object-cover" />}
          </Link>
          <div className="min-w-0 flex-1 text-[15px]">
            {author}
            <p className="text-[12px] text-ink-3">
              {p.author.isAdmin && <span className="font-semibold text-red-soft">Admin · </span>}
              {p.kind !== "POST" && <span>{kindLabel(p.kind)} · </span>}
              {ago(p.createdAt)}
              {p.edited && " · edited"}
            </p>
          </div>
          {p.pinned && <PinIcon />}
          {!preview && <MenuButton onClick={() => setMenu(true)} />}
        </div>
      )}

      {p.status === "PENDING" && !preview && <p className="mx-4 mt-3 rounded-lg bg-amber/10 px-3 py-1.5 text-[12px] font-semibold text-amber">Waiting for admin approval — only you and the admins can see it</p>}

      {p.replyTo && <p className="mx-4 mt-3 border-l-2 border-white/20 pl-2 text-[12px] text-ink-3">{p.replyTo.author.displayName}: {p.replyTo.body.slice(0, 120)}</p>}

      {editing ? (
        <div className="px-4 pt-3">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} maxLength={5000} className="w-full rounded-xl border border-line bg-bg p-3 text-sm outline-none focus:border-red" />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={async () => {
                await patch({ body: draft.trim() }, "Saved");
                setEditing(false);
              }}
              className="rounded-full bg-red px-4 py-2 text-sm font-bold text-white"
            >
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-full border border-line px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        p.body && (
          <p className="whitespace-pre-wrap break-words px-4 pt-3 text-[15px] leading-relaxed">
            <Linkified text={p.body} linkClassName="underline text-red-soft" />
          </p>
        )
      )}

      {p.media.length > 0 && <MediaGrid media={p.media} />}

      {p.poll && (
        <div className="mx-4 mt-3 rounded-2xl border border-white/10 bg-black/40 p-3">
          {p.poll.kind === "RSVP" && (
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="3.5" y="5" width="17" height="15" rx="2" />
                  <path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" />
                </svg>
              </span>
              <span>
                <span className="block font-bold">Are you coming?</span>
                <span className="block text-[12px] text-ink-3">{p.poll.closed ? "Responses closed" : "Tap to choose — you can change it"}</span>
              </span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {p.poll.options.map((opt, i) => {
              const pct = p.poll!.totalVotes ? Math.round((p.poll!.counts[i] / p.poll!.totalVotes) * 100) : 0;
              const mineSel = p.poll!.myVote === i;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={p.poll!.closed || voting || preview}
                  onClick={() => vote(i)}
                  className="relative flex min-h-11 items-center gap-3 overflow-hidden rounded-full border border-white/10 px-3 text-left disabled:cursor-default"
                >
                  <span className={`absolute inset-y-0 left-0 ${mineSel ? "bg-red/70" : "bg-white/10"}`} style={{ width: `${pct}%` }} aria-hidden />
                  {p.poll!.kind === "RSVP" && (
                    <span className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${mineSel ? "border-white bg-white text-red" : "border-white/50"}`}>
                      {mineSel && "✓"}
                    </span>
                  )}
                  <span className="relative flex-1 text-[14px]">{opt}</span>
                  <span className="relative text-[14px] font-bold">{pct}%</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] text-ink-3">
            {p.poll.totalVotes} {p.poll.kind === "RSVP" ? "responses" : "votes"}
            {p.poll.closesAt ? ` · ${endsIn(p.poll.closesAt)}` : ""}
            {p.poll.kind === "RSVP" && p.poll.totalVotes > 0 ? ` · ${p.poll.options.map((o, i) => `${p.poll!.counts[i]} ${o.split(",")[0].toLowerCase()}`).join(" · ")}` : ""}
          </p>
        </div>
      )}

      {!preview && p.status === "PUBLISHED" && (
        <div className="mt-2 flex items-center gap-6 px-4 py-3 text-[14px] text-ink-2">
          <button type="button" onClick={() => setComments(true)} className="flex items-center gap-1.5" aria-label={p.kind === "QUESTION" ? "Answers" : "Comments"}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M20 11.5a8 8 0 01-11.6 7.1L4 20l1.4-4.1A8 8 0 1120 11.5z" strokeLinejoin="round" />
            </svg>
            {p.commentCount > 0 ? p.commentCount : p.kind === "QUESTION" ? "Answer" : ""}
          </button>
          <button type="button" onClick={like} className={`flex items-center gap-1.5 ${p.likedByMe ? "text-red-soft" : ""}`} aria-pressed={p.likedByMe} aria-label="Like">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill={p.likedByMe ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M12 20s-7-4.4-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.6-7 9-7 9z" strokeLinejoin="round" />
            </svg>
            {p.likeCount > 0 && p.likeCount}
          </button>
          <button type="button" onClick={share} className="ml-auto" aria-label="Share">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
      {preview && <div className="pb-3" />}

      <BottomSheet open={comments} onClose={() => setComments(false)} title={p.kind === "QUESTION" ? "Answers" : "Comments"} height="half">
        {comments && <SongComments postId={p.id} listVisible layout="sheet" onPosted={() => onChange({ ...p, commentCount: p.commentCount + 1 })} />}
      </BottomSheet>

      <BottomSheet open={menu} onClose={() => setMenu(false)} title="Post options">
        <div className="flex flex-col pb-[calc(env(safe-area-inset-bottom)+12px)]">
          {canModerate && p.status === "PUBLISHED" && (
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                patch({ pinned: !p.pinned }, p.pinned ? "Unpinned" : "Pinned to the top");
              }}
              className="px-5 py-4 text-left text-[16px] font-semibold"
            >
              {p.pinned ? "Unpin" : "Pin to the top"}
            </button>
          )}
          {p.mine && (
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                setDraft(p.body);
                setEditing(true);
              }}
              className="px-5 py-4 text-left text-[16px] font-semibold"
            >
              Edit
            </button>
          )}
          {(p.mine || canModerate) && (
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                remove();
              }}
              className="px-5 py-4 text-left text-[16px] font-semibold text-red-soft"
            >
              Delete{!p.mine ? " (moderate)" : ""}
            </button>
          )}
          {!p.mine && (
            <div className="px-5 py-4">
              <ReportButton targetType="POST" targetId={p.id} ownerId={p.author.id} className="text-[16px] font-semibold text-ink-2" />
            </div>
          )}
        </div>
      </BottomSheet>
    </article>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink-2" fill="currentColor" aria-label="Pinned">
      <path d="M14 3l7 7-2.5.5-3.5 3.5.5 4.5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 4.5.5L15 6.5z" />
    </svg>
  );
}

function MenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Post options" className="px-1 text-xl leading-none text-ink-2">
      ⋮
    </button>
  );
}

function MediaGrid({ media }: { media: TimelineMedia[] }) {
  const shown = media.slice(0, 4);
  const extra = media.length - shown.length;
  return (
    <div className={`mt-3 grid gap-0.5 ${shown.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
      {shown.map((m, i) => (
        <div key={m.url} className={`relative overflow-hidden bg-black ${shown.length === 1 ? "max-h-[520px]" : "aspect-square"} ${shown.length === 3 && i === 0 ? "col-span-2 aspect-[2/1]" : ""}`}>
          {m.type === "video" ? (
            <video src={m.url} controls playsInline preload="metadata" className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- raw upload, EXIF rotation kept
            <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
          )}
          {i === shown.length - 1 && extra > 0 && <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-2xl font-bold">+{extra}</span>}
        </div>
      ))}
    </div>
  );
}

function Composer({
  open,
  onClose,
  communityId,
  viewer,
  onPosted,
}: {
  open: boolean;
  onClose: () => void;
  communityId: string;
  viewer: Viewer;
  onPosted: (p: Post) => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<string>("POST");
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<TimelineMedia[]>([]);
  const [uploading, setUploading] = useState(0);
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [closesAt, setClosesAt] = useState("");
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const kinds = TIMELINE_KINDS.filter((k) => viewer.isAdmin || !ADMIN_ONLY_KINDS.has(k.key));

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files).slice(0, MAX_TIMELINE_MEDIA - media.length);
    for (const file of list) {
      const isVideo = file.type.startsWith("video/");
      if (isVideo && file.size > 100 * 1024 * 1024) {
        toast.error("Videos can be up to 100 MB");
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const ext = (file.name.split(".").pop() || (isVideo ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
        const pre = await apiFetch("/api/uploads/presign", { method: "POST", body: JSON.stringify({ kind: "postmedia", contentType: file.type, extension: ext }) });
        if (!pre.ok) throw new Error("That file type isn't supported");
        const { uploadUrl, publicUrl } = await pre.json();
        const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!put.ok) throw new Error("Upload failed");
        setMedia((cur) => [...cur, { url: publicUrl, type: isVideo ? "video" : "image" }]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function submit() {
    const isPoll = kind === "POLL";
    const isRsvp = kind === "EVENT_RSVP";
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (isPoll && opts.length < 2) return toast.error("Add at least two options");
    if (!body.trim() && media.length === 0) return toast.error(isPoll ? "Write the poll question" : "Write something or add a photo or video");
    setPosting(true);
    try {
      const res = await apiFetch(`/api/communities/${communityId}/timeline`, {
        method: "POST",
        body: JSON.stringify({
          kind,
          body: body.trim(),
          media,
          ...(isPoll || isRsvp ? { poll: { options: isPoll ? opts : opts.length >= 2 ? opts : undefined, closesAt: closesAt ? new Date(closesAt).toISOString() : null } } : {}),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Couldn't post");
      onPosted(d.post);
      setBody("");
      setMedia([]);
      setOptions(["", ""]);
      setClosesAt("");
      setKind("POST");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't post");
    } finally {
      setPosting(false);
    }
  }

  const placeholder =
    kind === "POLL"
      ? "Ask your question…"
      : kind === "QUESTION"
        ? "What would you like to ask the community?"
        : kind === "EVENT_RSVP"
          ? "e.g. X RECORDING CAMP IS IN JANUARY! Who's coming?"
          : kind === "COLLAB"
            ? "What are you working on, and who are you looking for?"
            : "Share something with the community…";

  return (
    <BottomSheet open={open} onClose={onClose} title="New post" height="half">
      <div className="flex flex-col gap-4 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
          {kinds.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${kind === k.key ? "border-red bg-red/10 text-red-soft" : "border-line text-ink-2"}`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={5000} placeholder={placeholder} className="rounded-2xl border border-line bg-surface p-4 text-[15px] outline-none focus:border-red" />

        {(kind === "POLL" || kind === "EVENT_RSVP") && (
          <div className="flex flex-col gap-2">
            <span className="text-[12px] uppercase tracking-widest text-ink-3">{kind === "POLL" ? "Options" : "Attendance options"}</span>
            {kind === "EVENT_RSVP" && options.every((o) => !o.trim()) && <p className="text-xs text-ink-3">Leave blank to use: {RSVP_DEFAULT_OPTIONS.join(" · ")}</p>}
            {options.map((o, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={o}
                  onChange={(e) => setOptions((cur) => cur.map((x, j) => (j === i ? e.target.value.slice(0, 80) : x)))}
                  placeholder={kind === "EVENT_RSVP" ? (RSVP_DEFAULT_OPTIONS[i] ?? `Option ${i + 1}`) : `Option ${i + 1}`}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-red"
                />
                {options.length > 2 && (
                  <button type="button" onClick={() => setOptions((cur) => cur.filter((_, j) => j !== i))} className="px-2 text-ink-3" aria-label="Remove option">
                    ×
                  </button>
                )}
              </div>
            ))}
            {options.length < 8 && (
              <button type="button" onClick={() => setOptions((cur) => [...cur, ""])} className="self-start text-sm font-semibold text-red-soft">
                + Add option
              </button>
            )}
            <label className="flex flex-col gap-1 text-xs text-ink-3">
              {kind === "POLL" ? "Poll closes (optional)" : "Responses close (optional)"}
              <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-red" />
            </label>
          </div>
        )}

        {media.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {media.map((m) => (
              <div key={m.url} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-black">
                {m.type === "video" ? (
                  <video src={m.url} className="h-full w-full object-cover" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- local preview
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                )}
                <button type="button" onClick={() => setMedia((cur) => cur.filter((x) => x.url !== m.url))} className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs" aria-label="Remove">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={media.length >= MAX_TIMELINE_MEDIA}
            className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="10" r="1.6" />
              <path d="M21 16l-5-5-8 8" strokeLinejoin="round" />
            </svg>
            Photos / videos
          </button>
          {uploading > 0 && <span className="text-xs text-ink-3">Uploading {uploading}…</span>}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {viewer.publish === "PENDING" && <p className="text-xs text-ink-3">This community reviews member posts — an admin approves it before others see it.</p>}

        <button type="button" onClick={submit} disabled={posting || uploading > 0} className="rounded-full bg-red py-3.5 text-[15px] font-bold text-white disabled:opacity-50">
          {posting ? "Posting…" : viewer.publish === "PENDING" ? "Submit for approval" : "Post"}
        </button>
      </div>
    </BottomSheet>
  );
}
