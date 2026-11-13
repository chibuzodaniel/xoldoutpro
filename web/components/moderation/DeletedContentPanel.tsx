"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import type { DeletedListItem, DeletedFilter } from "@/lib/moderation/deletedContent";

const FILTERS: { value: DeletedFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "POST", label: "Posts" },
  { value: "COMMENT", label: "Post comments" },
  { value: "FEEDBACK", label: "XOLDOUT feedback" },
  { value: "SONG_COMMENT", label: "Song comments" },
  { value: "COMMUNITY", label: "Communities" },
  { value: "PLAYLIST", label: "Playlists" },
  { value: "ADD_ON", label: "Extras" },
  { value: "RELEASE", label: "Releases" },
  { value: "BEAT", label: "Beats" },
  { value: "MERCH", label: "Merch" },
  { value: "EVENT", label: "Events" },
];

const KIND_LABEL: Record<string, string> = {
  POST: "Post",
  COMMENT: "Post comment",
  FEEDBACK: "Feedback",
  SONG_COMMENT: "Song comment",
  COMMUNITY: "Community",
  PLAYLIST: "Playlist",
  ADD_ON: "Extra",
  RELEASE: "Release",
  BEAT: "Beat",
  MERCH: "Merch",
  EVENT: "Event",
};

const ROLE_LABEL: Record<string, string> = {
  OWNER: "the owner",
  COMMUNITY_ADMIN: "a community admin",
  CREATOR: "the song's artist",
  MODERATOR: "a moderator",
  UNRECORDED: "owner or moderator",
};

type Snapshot = { kind: string; title: string; counts: Record<string, number>; main: Record<string, unknown> | null };

const COUNT_LABEL: Record<string, string> = {
  post: "posts",
  pollVote: "poll votes",
  postLike: "likes",
  comment: "comments",
  supportReply: "replies",
  commentVote: "comment likes",
  report: "reports",
  songComment: "comments incl. replies",
  songCommentVote: "votes",
  collectionItem: "songs",
  membership: "members",
  joinRequest: "join requests",
  communityChannel: "channels",
  membershipPlan: "plans",
};

function when(iso: string) {
  return new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Everything users deleted, newest first (explicit ask, 2026-11-11). Super
 * moderators only. Deleted items never show anywhere else in the app; from
 * here they can be read as they were and put back. DMs are not kept.
 */
export function DeletedContentPanel() {
  const toast = useToast();
  const [filter, setFilter] = useState<DeletedFilter>("ALL");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<DeletedListItem[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  function url(before: string | null) {
    const p = new URLSearchParams({ kind: filter, q: query });
    if (before) p.set("before", before);
    return `/api/admin/deleted-content?${p}`;
  }

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await apiFetch(url(null));
      if (cancelled || !res.ok) return;
      const data = await res.json();
      setItems(data.items);
      setNextBefore(data.nextBefore);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- url() reads filter/query
  }, [filter, query]);

  async function loadMore() {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      const res = await apiFetch(url(nextBefore));
      if (!res.ok) return;
      const data = await res.json();
      setItems((cur) => {
        const seen = new Set((cur ?? []).map((i) => i.source + i.id));
        return [...(cur ?? []), ...data.items.filter((i: DeletedListItem) => !seen.has(i.source + i.id))];
      });
      setNextBefore(data.nextBefore);
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleView(item: DeletedListItem) {
    if (openId === item.id) return setOpenId(null);
    setOpenId(item.id);
    if (item.source !== "ARCHIVE" || snapshots[item.id]) return;
    const res = await apiFetch(`/api/admin/deleted-content/${item.id}`);
    if (res.ok) {
      const data = await res.json();
      setSnapshots((s) => ({ ...s, [item.id]: data }));
    }
  }

  async function restore(item: DeletedListItem) {
    if (!(await toast.confirm(`Restore this ${KIND_LABEL[item.kind]?.toLowerCase() ?? "item"}? It will be visible again where it was.`, { confirmLabel: "Restore" }))) return;
    setBusyId(item.id);
    try {
      const res = await apiFetch("/api/admin/deleted-content", { method: "POST", body: JSON.stringify({ source: item.source, id: item.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not restore");
      toast.success(
        item.source === "ARCHIVE" ? "Restored." : `Restored as ${data.status === "PUBLISHED" ? "published" : "a draft"}.`,
      );
      setItems((list) =>
        item.source === "ARCHIVE"
          ? (list?.map((i) => (i.id === item.id ? { ...i, restoredAt: new Date().toISOString(), canRestore: false } : i)) ?? null)
          : (list?.filter((i) => !(i.source === item.source && i.id === item.id)) ?? null),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-1">Deleted content</p>
      <p className="text-xs text-ink-3 mb-3">
        Everything people delete is taken down for everyone else and kept here, visible only to super moderators. Direct messages are not kept.
      </p>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
              filter === f.value ? "border-red bg-red/10 text-red-soft" : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by text, title or owner @handle"
        className="mb-3 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-red"
      />
      {items === null ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-ink-3">Nothing deleted{query ? " matches that search" : ""}.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft">
          {items.map((item) => {
            const snap = snapshots[item.id];
            const body = typeof snap?.main?.body === "string" ? (snap.main.body as string) : null;
            const image = typeof snap?.main?.imageUrl === "string" ? (snap.main.imageUrl as string) : null;
            return (
              <div key={item.source + item.id} className="py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      <span className="mr-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-3">
                        {KIND_LABEL[item.kind] ?? item.kind}
                      </span>
                      <span className="break-words">{item.title}</span>
                    </p>
                    {item.preview && <p className="mt-0.5 line-clamp-2 break-words text-xs text-ink-2">{item.preview}</p>}
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {item.owner ? `@${item.owner.handle}` : "Unknown owner"} · deleted {when(item.deletedAt)} by{" "}
                      {item.deletedBy && item.deletedByRole !== "OWNER" ? `@${item.deletedBy.handle} (${ROLE_LABEL[item.deletedByRole] ?? item.deletedByRole})` : ROLE_LABEL[item.deletedByRole] ?? item.deletedByRole}
                      {item.restoredAt && <span className="font-semibold text-green"> · restored {when(item.restoredAt)}</span>}
                    </p>
                    {item.note && <p className="mt-0.5 text-[11px] font-semibold text-amber">{item.note}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.source === "ARCHIVE" && (
                      <button type="button" onClick={() => toggleView(item)} className="text-xs font-semibold text-red-soft">
                        {openId === item.id ? "Close" : "View"}
                      </button>
                    )}
                    {item.canRestore && (
                      <button
                        type="button"
                        onClick={() => restore(item)}
                        disabled={busyId !== null}
                        className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        {busyId === item.id ? "Restoring…" : "Restore"}
                      </button>
                    )}
                  </div>
                </div>
                {openId === item.id && item.source === "ARCHIVE" && (
                  <div className="mt-2 rounded-lg border border-line-soft bg-surface p-3 text-xs">
                    {!snap ? (
                      <p className="text-ink-3">Loading…</p>
                    ) : (
                      <>
                        {body && <p className="mb-2 whitespace-pre-wrap break-words text-sm text-ink">{body}</p>}
                        {image && (
                          // eslint-disable-next-line @next/next/no-img-element -- admin-only preview
                          <img src={image} alt="" className="mb-2 max-h-64 rounded-lg object-contain" />
                        )}
                        {typeof snap.main?.description === "string" && <p className="mb-2 break-words text-ink-2">{snap.main.description as string}</p>}
                        <p className="text-ink-3">
                          Kept with it:{" "}
                          {Object.entries(snap.counts)
                            .filter(([t, n]) => n > 0 && COUNT_LABEL[t])
                            .map(([t, n]) => `${t === "post" && snap.kind === "POST" ? n - 1 : n} ${COUNT_LABEL[t]}${t === "post" && snap.kind === "POST" ? " (reposts)" : ""}`)
                            .filter((s) => !s.startsWith("0 "))
                            .join(" · ") || "nothing else"}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {nextBefore && items && items.length > 0 && (
        <button type="button" onClick={loadMore} disabled={loadingMore} className="mt-3 text-xs font-semibold text-red-soft disabled:opacity-50">
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
