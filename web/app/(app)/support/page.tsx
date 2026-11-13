"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { BackHeader } from "@/components/ui/BackHeader";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { UserHandleAutocomplete } from "@/components/ui/UserHandleAutocomplete";
import { setUrlParam } from "@/lib/backNav";
import { saveSnapshot, takeSnapshot } from "@/lib/backNav";
import { Linkified } from "@/components/ui/Linkified";

// The XOLDOUT channel (explicit ask, 2026-11-12): everyone can send an issue,
// complaint or idea. The team (added by a super admin) is assigned items,
// replies and marks them solved. Everyone sees solved items and all of their
// own; rules enforced by app/api/support/*. Loaded per tab — never polled.

type Person = { id: string; handle: string; displayName: string; avatarUrl: string | null };
type Ticket = {
  id: string;
  kind: "ISSUE" | "COMPLAINT" | "IDEA";
  title: string;
  body: string;
  media: { url: string; type: string }[];
  status: "OPEN" | "IN_PROGRESS" | "SOLVED";
  solvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
  author: Person | null;
  assignee: Person | null;
  replyCount: number;
  ignored: boolean;
};
type Role = { isSuper: boolean; isTeam: boolean };
type View = "solved" | "mine" | "open" | "assigned" | "ignored" | "all" | "team" | "progress";

const KIND: Record<string, { label: string; cls: string }> = {
  ISSUE: { label: "Issue", cls: "bg-red/15 text-red-soft" },
  COMPLAINT: { label: "Complaint", cls: "bg-amber/15 text-amber" },
  IDEA: { label: "Idea", cls: "bg-green/15 text-green" },
};
const STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Open", cls: "border-white/25 text-ink-2" },
  IN_PROGRESS: { label: "In progress", cls: "border-amber/50 text-amber" },
  SOLVED: { label: "Solved", cls: "border-green/50 text-green" },
};

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function Avatar({ p, size = 24 }: { p: Person; size?: number }) {
  return (
    <span className="inline-block shrink-0 overflow-hidden rounded-full bg-surface-2" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small avatar */}
      {p.avatarUrl && <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />}
    </span>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={<LoadingSpinner full size="lg" />}>
      <SupportChannel />
    </Suspense>
  );
}

function SupportChannel() {
  const { appUser } = useAuth();
  const sp = useSearchParams();
  const [view, setView] = useState<View>((sp.get("view") as View | null) ?? "solved");
  const [role, setRole] = useState<Role | null>(null);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [counts, setCounts] = useState({ open: 0, assigned: 0, ignored: 0 });
  const [openId, setOpenId] = useState<string | null>(sp.get("t"));
  const [composer, setComposer] = useState(false);

  const load = useCallback(
    async (v: View, before?: string) => {
      if (v === "team" || v === "progress") return;
      const res = await apiFetch(`/api/support/tickets?view=${v}${before ? `&before=${encodeURIComponent(before)}` : ""}`);
      if (!res.ok) return setTickets([]);
      const d = await res.json();
      setRole(d.role);
      setCounts({ open: d.openCount, assigned: d.assignedCount, ignored: d.ignoredCount ?? 0 });
      setNextBefore(d.nextBefore);
      setTickets((cur) => (before ? [...(cur ?? []), ...d.tickets] : d.tickets));
    },
    [],
  );

  // Back/forward: restore the list you left (including "Show more" pages).
  useEffect(() => {
    if (!appUser) return;
    const snap = takeSnapshot<{ tickets: Ticket[]; nextBefore: string | null; role: Role | null; counts: { open: number; assigned: number; ignored: number } }>(`support:${view}`);
    if (snap) {
      /* eslint-disable react-hooks/set-state-in-effect -- restoring the list you left */
      setTickets(snap.tickets);
      setNextBefore(snap.nextBefore);
      setRole(snap.role);
      setCounts(snap.counts);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
     
    setTickets(null);
    load(view);
  }, [appUser, view, load]);
  useEffect(() => {
    if (tickets) saveSnapshot(`support:${view}`, { tickets, nextBefore, role, counts });
  }, [view, tickets, nextBefore, role, counts]);

  // The team lands on what's open the first time.
  const firstRole = useRef(true);
  useEffect(() => {
    if (role?.isTeam && firstRole.current && !sp.get("t") && !sp.get("view")) {
      firstRole.current = false;
      setView("open");
    }
  }, [role, sp]);

  const tabs: { key: View; label: string }[] = role?.isTeam
    ? [
        { key: "open", label: `Open${counts.open ? ` (${counts.open})` : ""}` },
        { key: "assigned", label: `Assigned to me${counts.assigned ? ` (${counts.assigned})` : ""}` },
        { key: "ignored", label: `Needs attention${counts.ignored ? ` (${counts.ignored})` : ""}` },
        { key: "solved", label: "Solved" },
        { key: "mine", label: "My feedback" },
        ...(role.isSuper ? [{ key: "progress" as View, label: "Progress" }, { key: "team" as View, label: "Team" }] : []),
      ]
    : [
        { key: "solved", label: "Solved" },
        { key: "mine", label: "My feedback" },
      ];

  return (
    <div className="pb-24">
      <BackHeader title="XOLDOUT" />
      <div className="mx-auto max-w-2xl px-4">
        <div className="flex items-center gap-3.5 rounded-2xl border border-red/30 bg-gradient-to-br from-red/25 to-black p-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black ring-2 ring-red">
            {/* eslint-disable-next-line @next/next/no-img-element -- static logo */}
            <img src="/xoldout-icon-transparent.png" alt="XOLDOUT" className="h-11 w-11" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[20px] font-extrabold tracking-tight">
              XOLDOUT
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-red-soft" fill="currentColor" aria-label="Verified">
                <path d="M12 2l2.4 2.1 3.2-.4.9 3.1 2.8 1.6-1.1 3 1.1 3-2.8 1.6-.9 3.1-3.2-.4L12 22l-2.4-2.1-3.2.4-.9-3.1-2.8-1.6 1.1-3-1.1-3 2.8-1.6.9-3.1 3.2.4z" />
                <path d="M8.5 12.2l2.3 2.3 4.7-4.8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </p>
            <p className="text-[13px] text-ink-2">Official channel · Issues, complaints &amp; ideas</p>
          </div>
        </div>

        <button type="button" onClick={() => setComposer(true)} className="mt-3 w-full rounded-full bg-red py-3 text-[15px] font-bold text-white">
          + Report an issue or share an idea
        </button>

        <div className="-mx-4 mt-4 flex gap-5 overflow-x-auto border-b border-line-soft px-4 [scrollbar-width:none]">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setView(t.key);
                setUrlParam("view", t.key);
              }}
              className={`-mb-px shrink-0 border-b-2 pb-2.5 text-[15px] font-semibold ${view === t.key ? "border-red text-ink" : "border-transparent text-ink-3"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {view === "team" ? (
          <TeamPanel />
        ) : view === "progress" ? (
          <ProgressPanel />
        ) : tickets === null ? (
          <LoadingSpinner full size="md" />
        ) : tickets.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-3">
            {view === "mine" ? "You haven't sent anything yet." : view === "solved" ? "Nothing solved yet." : view === "ignored" ? "Nothing is being ignored. Nice." : "Nothing here right now."}
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">
            {tickets.map((t) => (
              <TicketCard key={t.id} t={t} onOpen={() => setOpenId(t.id)} />
            ))}
            {nextBefore && (
              <button type="button" onClick={() => load(view, nextBefore)} className="py-3 text-sm font-semibold text-ink-2">
                Show more
              </button>
            )}
          </div>
        )}
      </div>

      <Composer
        open={composer}
        onClose={() => setComposer(false)}
        onSent={(t) => {
          setComposer(false);
          setView("mine");
          setOpenId(t.id);
        }}
      />
      {openId && (
        <TicketSheet
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={(t) => setTickets((cur) => cur?.map((x) => (x.id === t.id ? t : x)) ?? cur)}
        />
      )}
    </div>
  );
}

function TicketCard({ t, onOpen }: { t: Ticket; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-xl border border-white/10 bg-[#111] p-3.5 text-left">
      <div className="flex items-center gap-2 text-[11px]">
        <span className={`rounded-full px-2 py-0.5 font-bold uppercase tracking-wide ${KIND[t.kind].cls}`}>{KIND[t.kind].label}</span>
        <span className={`rounded-full border px-2 py-0.5 font-semibold ${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span>
        {t.ignored && <span className="rounded-full bg-amber/15 px-2 py-0.5 font-semibold text-amber">{t.assignee ? "No update 2d+" : "Unpicked 1d+"}</span>}
        {t.mine && <span className="text-ink-3">· Yours</span>}
        <span className="ml-auto text-ink-3">{ago(t.updatedAt)}</span>
      </div>
      <p className="mt-2 line-clamp-1 text-[15px] font-semibold">{t.title}</p>
      <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{t.body}</p>
      <div className="mt-2 flex items-center gap-2 text-[12px] text-ink-3">
        {t.author && <span>by @{t.author.handle}</span>}
        {t.assignee && (
          <span className="flex items-center gap-1">
            {t.author && "·"} <Avatar p={t.assignee} size={16} /> {t.status === "SOLVED" ? "Solved by" : "With"} {t.assignee.displayName}
          </span>
        )}
        {t.replyCount > 0 && <span className="ml-auto">{t.replyCount} repl{t.replyCount === 1 ? "y" : "ies"}</span>}
      </div>
    </button>
  );
}

function TicketSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: (t: Ticket) => void }) {
  const toast = useToast();
  const myId = useAuth().appUser?.id;
  const [data, setData] = useState<{ ticket: Ticket; replies: { id: string; body: string; createdAt: string; author: Person; fromTeam: boolean }[]; role: Role; team: Person[] } | null>(null);
  const [missing, setMissing] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch(`/api/support/tickets/${id}`).then(async (r) => (r.ok ? setData(await r.json()) : setMissing(true)));
  }, [id]);

  async function patch(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/support/tickets/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Couldn't save");
      setData((cur) => (cur ? { ...cur, ticket: d.ticket } : cur));
      onChanged(d.ticket);
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/support/tickets/${id}/replies`, { method: "POST", body: JSON.stringify({ body: reply.trim() }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Couldn't send");
      setData((cur) => (cur ? { ...cur, replies: [...cur.replies, d.reply] } : cur));
      setReply("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setBusy(false);
    }
  }

  const t = data?.ticket;
  const canTalk = Boolean(data && (data.role.isTeam || t?.mine));

  return (
    <BottomSheet open onClose={onClose} title={t ? KIND[t.kind].label : "Feedback"} height="half">
      <div className="flex flex-col gap-3 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        {missing ? (
          <p className="py-6 text-center text-sm text-ink-3">This isn&apos;t available.</p>
        ) : !data || !t ? (
          <p className="py-6 text-center text-sm text-ink-3">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className={`rounded-full border px-2 py-0.5 font-semibold ${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span>
              <span className="text-ink-3">
                {t.author ? `@${t.author.handle} · ` : ""}
                {ago(t.createdAt)}
              </span>
            </div>
            <p className="text-[17px] font-bold">{t.title}</p>
            <p className="whitespace-pre-wrap break-words text-[14px] text-ink-2">
              <Linkified text={t.body} linkClassName="underline text-red-soft" />
            </p>
            {t.media.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {t.media.map((m) => (
                  <a key={m.url} href={m.url} target="_blank" rel="noopener noreferrer" className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element -- screenshot */}
                    <img src={m.url} alt="" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-[13px]">
              {t.assignee ? (
                <>
                  <Avatar p={t.assignee} />
                  <span>
                    {t.status === "SOLVED" ? "Solved by" : "Assigned to"} <b>{t.assignee.displayName}</b> <span className="text-ink-3">@{t.assignee.handle}</span>
                  </span>
                </>
              ) : (
                <span className="text-ink-3">Not assigned yet</span>
              )}
            </div>

            {data.role.isTeam && (
              <div className="flex flex-col gap-2 rounded-xl border border-red/30 bg-red/5 p-3">
                <p className="text-[11px] font-bold uppercase tracking-widest text-ink-3">Team</p>
                {t.status !== "SOLVED" && (!t.assignee || ((t.ignored || data.role.isSuper) && t.assignee.id !== myId)) && t.assignee?.id !== myId && (
                  <button type="button" disabled={busy} onClick={() => patch({ pickUp: true }, "It's yours now")} className="rounded-full bg-red py-2.5 text-[14px] font-bold text-white disabled:opacity-50">
                    {t.assignee ? `Take over from ${t.assignee.displayName}` : "Pick this up"}
                  </button>
                )}
                <div className="flex flex-wrap gap-2">
                  {(["OPEN", "IN_PROGRESS", "SOLVED"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy || t.status === s}
                      onClick={() => patch({ status: s }, `Marked ${STATUS[s].label.toLowerCase()}`)}
                      className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60 ${t.status === s ? "border-red bg-red/15 text-red-soft" : "border-line text-ink-2"}`}
                    >
                      {STATUS[s].label}
                    </button>
                  ))}
                </div>
                {data.role.isSuper && (
                  <label className="flex items-center gap-2 text-[13px] text-ink-2">
                    Assign to
                    <select
                      value={t.assignee?.id ?? ""}
                      disabled={busy}
                      onChange={(e) => patch({ assigneeId: e.target.value || null }, e.target.value ? "Assigned" : "Unassigned")}
                      className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 py-1.5 text-sm outline-none"
                    >
                      <option value="">Nobody</option>
                      {data.team.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName} (@{m.handle})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            {canTalk && (
              <>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-ink-3">Conversation</p>
                {data.replies.length === 0 && <p className="text-[13px] text-ink-3">No replies yet.</p>}
                {data.replies.map((r) => (
                  <div key={r.id} className={`rounded-xl px-3 py-2 text-[14px] ${r.fromTeam ? "border border-red/25 bg-red/10" : "bg-white/5"}`}>
                    <p className="mb-0.5 text-[11px] text-ink-3">
                      {r.fromTeam ? "XOLDOUT · " : ""}
                      {r.author.displayName} · {ago(r.createdAt)}
                    </p>
                    <p className="whitespace-pre-wrap break-words">{r.body}</p>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value.slice(0, 2000))}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                    placeholder={data.role.isTeam && !t.mine ? "Reply to the sender…" : "Add more details…"}
                    className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-red"
                  />
                  <button type="button" onClick={send} disabled={busy || !reply.trim()} className="rounded-full bg-red px-4 text-sm font-bold text-white disabled:opacity-40">
                    Send
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}

function Composer({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: (t: Ticket) => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<"ISSUE" | "COMPLAINT" | "IDEA">("ISSUE");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<{ url: string; type: "image" }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 4 - media.length)) {
        const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[file.type];
        if (!ext) continue;
        const pre = await apiFetch("/api/uploads/presign", { method: "POST", body: JSON.stringify({ kind: "postmedia", contentType: file.type, extension: ext }) });
        if (!pre.ok) throw new Error("Upload failed");
        const { uploadUrl, publicUrl } = await pre.json();
        const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!put.ok) throw new Error("Upload failed");
        setMedia((cur) => [...cur, { url: publicUrl, type: "image" }]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    setSending(true);
    try {
      const res = await apiFetch("/api/support/tickets", { method: "POST", body: JSON.stringify({ kind, title: title.trim(), body: body.trim(), media }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Couldn't send");
      toast.success("Sent to the XOLDOUT team. Thank you!");
      setTitle("");
      setBody("");
      setMedia([]);
      onSent(d.ticket);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Tell XOLDOUT" height="half">
      <div className="flex flex-col gap-3 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <div className="flex gap-2">
          {(["ISSUE", "COMPLAINT", "IDEA"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex-1 rounded-full border py-2 text-[13px] font-semibold ${kind === k ? "border-red bg-red/10 text-red-soft" : "border-line text-ink-2"}`}
            >
              {KIND[k].label}
            </button>
          ))}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 120))}
          placeholder={kind === "IDEA" ? "Your idea in a few words" : "What's wrong, in a few words"}
          className="rounded-xl border border-line bg-surface px-3.5 py-3 text-sm outline-none focus:border-red"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 4000))}
          rows={5}
          placeholder={kind === "IDEA" ? "Tell us more about it…" : "What happened? Where in the app, and what did you expect?"}
          className="rounded-xl border border-line bg-surface p-3.5 text-sm outline-none focus:border-red"
        />
        <div className="flex items-center gap-2">
          {media.map((m) => (
            <span key={m.url} className="relative h-14 w-14 overflow-hidden rounded-lg bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
              <img src={m.url} alt="" className="h-full w-full object-cover" />
              <button type="button" onClick={() => setMedia((cur) => cur.filter((x) => x.url !== m.url))} className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-black/70 text-[10px]" aria-label="Remove">
                ×
              </button>
            </span>
          ))}
          {media.length < 4 && (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-full border border-line px-3 py-2 text-[13px] font-semibold disabled:opacity-50">
              {uploading ? "Uploading…" : "+ Screenshot"}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>
        <p className="text-[12px] text-ink-3">Only you and the XOLDOUT team can see this until it&apos;s solved. Once solved, others can see the issue (not who sent it).</p>
        <button type="button" onClick={send} disabled={sending || uploading} className="rounded-full bg-red py-3.5 text-[15px] font-bold text-white disabled:opacity-50">
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </BottomSheet>
  );
}

function TeamPanel() {
  const toast = useToast();
  const [members, setMembers] = useState<{ addedAt: string; user: Person }[] | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    apiFetch("/api/support/team")
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => setMembers(d.members));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add(userId: string) {
    const res = await apiFetch("/api/support/team", { method: "POST", body: JSON.stringify({ userId }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(typeof d.error === "string" ? d.error : "Couldn't add");
    toast.success("Added to the team");
    load();
  }
  async function remove(p: Person) {
    if (!(await toast.confirm(`Remove @${p.handle} from the team? Their open items become unassigned.`, { confirmLabel: "Remove", destructive: true }))) return;
    const res = await apiFetch(`/api/support/team?userId=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't remove");
    load();
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="text-sm text-ink-3">Team members can be assigned issues and feedback, reply to senders and mark items solved. Super moderators are always on the team.</p>
      <UserHandleAutocomplete
        value={query}
        onChange={setQuery}
        placeholder="Add someone by name or @handle"
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-red"
        onSelect={(u) => {
          setQuery("");
          add(u.id);
        }}
      />
      {members === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-ink-3">No team members yet.</p>
      ) : (
        members.map((m) => (
          <div key={m.user.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#111] px-3 py-2.5">
            <Avatar p={m.user} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{m.user.displayName}</span>
              <span className="block text-xs text-ink-3">@{m.user.handle}</span>
            </span>
            <button type="button" onClick={() => remove(m.user)} className="text-xs text-ink-3">
              Remove
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function ProgressPanel() {
  type Row = { person: Person & { role: string }; open: number; ignored: number; solved7: number; solved30: number; avgSolveHours: number | null };
  const [data, setData] = useState<{ totals: { open: number; unassigned: number; inProgress: number; ignored: number; solved7: number }; members: Row[] } | null>(null);
  useEffect(() => {
    apiFetch("/api/support/progress")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, []);
  if (!data) return <LoadingSpinner full size="md" />;
  const tiles: [string, number, string?][] = [
    ["Open", data.totals.open],
    ["Unassigned", data.totals.unassigned, data.totals.unassigned ? "text-amber" : undefined],
    ["In progress", data.totals.inProgress],
    ["Ignored", data.totals.ignored, data.totals.ignored ? "text-red-soft" : undefined],
    ["Solved (7d)", data.totals.solved7, "text-green"],
  ];
  const time = (h: number | null) => (h == null ? "—" : h < 24 ? `${h}h` : `${Math.round(h / 24)}d`);
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {tiles.map(([label, n, cls]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-[#111] p-3">
            <p className="text-[11px] text-ink-3">{label}</p>
            <p className={`text-[20px] font-bold ${cls ?? ""}`}>{n}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#111]">
        <table className="w-full text-left text-[13px]">
          <thead className="text-ink-3">
            <tr>
              <th className="px-3 py-2 font-normal">Team member</th>
              <th className="px-2 py-2 font-normal">Open</th>
              <th className="px-2 py-2 font-normal">Ignored</th>
              <th className="px-2 py-2 font-normal">Solved 7d</th>
              <th className="px-2 py-2 font-normal">30d</th>
              <th className="px-2 py-2 font-normal">Avg time</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((r) => (
              <tr key={r.person.id} className="border-t border-white/10">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <Avatar p={r.person} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{r.person.displayName}</span>
                      <span className="block text-[11px] text-ink-3">{r.person.role}</span>
                    </span>
                  </span>
                </td>
                <td className="px-2 py-2">{r.open}</td>
                <td className={`px-2 py-2 ${r.ignored ? "font-bold text-red-soft" : ""}`}>{r.ignored}</td>
                <td className="px-2 py-2">{r.solved7}</td>
                <td className="px-2 py-2">{r.solved30}</td>
                <td className="px-2 py-2">{time(r.avgSolveHours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-3">&ldquo;Ignored&rdquo; = assigned with no reply or status change for 2 days, or unassigned for a day. Team members are reminded daily and can take ignored items over.</p>
    </div>
  );
}
