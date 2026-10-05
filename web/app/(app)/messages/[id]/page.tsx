"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { BottomSheet } from "@/components/live/BottomSheet";
import { ReportSheet } from "@/components/trust/ReportSheet";
import { DmAvatar } from "@/components/messages/Avatar";
import { DISAPPEAR_CHOICES, type DmMessage, type DmThread } from "@/components/messages/types";

// One direct-message conversation (explicit ask, 2026-10-04) — see
// lib/messages for the rules. Refreshes every 3s while the tab is visible
// (new messages, deletions, read receipts and disappearing-message changes
// all come with it); a push notification covers when it isn't open.

const REFRESH_MS = 3_000;

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
}

function dayOf(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });
}

function ShareCardView({ m }: { m: DmMessage }) {
  if (!m.share) return <p className="text-sm italic text-ink-3">This item is no longer available</p>;
  const s = m.share;
  return (
    <Link href={s.href} className="flex w-60 max-w-full items-center gap-3 rounded-xl bg-black/30 p-2">
      {s.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xl">{s.type === "LIVE" ? "🔴" : "🎵"}</span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{s.title}</span>
        <span className="block truncate text-xs opacity-75">{s.subtitle}</span>
        {s.status && (
          <span className={`mt-0.5 inline-block rounded-full px-1.5 text-[10px] font-bold ${s.status === "Live now" ? "bg-red text-white" : "bg-white/15"}`}>
            {s.status === "Live now" ? "Join live" : s.status}
          </span>
        )}
      </span>
    </Link>
  );
}

export default function ConversationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { firebaseUser, loading: authLoading } = useAuth();
  const [thread, setThread] = useState<DmThread | null>(null);
  const [missing, setMissing] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [disappearOpen, setDisappearOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastCountRef = useRef(0);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/messages/${params.id}`).catch(() => null);
    if (!res) return;
    if (res.status === 404) return setMissing(true);
    if (res.ok) setThread(await res.json());
  }, [params.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.push(`/login?next=/messages/${params.id}`);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load, then refresh while visible
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const id = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [authLoading, firebaseUser, load, params.id, router]);

  // Keep the newest message in view when new ones arrive.
  useEffect(() => {
    const count = thread?.messages.length ?? 0;
    if (count !== lastCountRef.current) {
      lastCountRef.current = count;
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [thread?.messages.length]);

  async function post(body: unknown) {
    const res = await apiFetch(`/api/messages/${params.id}/messages`, { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Couldn't send");
    }
    await load();
  }

  async function sendText() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await post({ kind: "TEXT", body });
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  async function sendImage(file: File) {
    setSending(true);
    try {
      const key = await uploadImage(file, "artwork");
      const res = await apiFetch("/api/uploads/artwork/finalize", { method: "POST", body: JSON.stringify({ key }) });
      if (!res.ok) throw new Error("Couldn't upload that photo");
      const data = await res.json();
      const imageUrl = (data.artworkLadder as Record<string, string>)["1024"];
      await post({ kind: "IMAGE", imageUrl, body: text.trim() || undefined });
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send that photo");
    } finally {
      setSending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function action(body: Record<string, unknown>, success?: string) {
    const res = await apiFetch(`/api/messages/${params.id}`, { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Something went wrong");
      return false;
    }
    if (success) toast.success(success);
    await load();
    return true;
  }

  async function deleteMessage(id: string) {
    setSelectedId(null);
    const ok = await toast.confirm("Delete this message for everyone?", { confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    const res = await apiFetch(`/api/messages/${params.id}/messages/${id}`, { method: "DELETE" });
    if (!res.ok) toast.error("Couldn't delete that message");
    await load();
  }

  async function setBlock(blocked: boolean) {
    if (!thread) return;
    if (blocked) {
      const ok = await toast.confirm(`Block ${thread.other.displayName}? They won't be able to message you.`, { confirmLabel: "Block", destructive: true });
      if (!ok) return;
    }
    const res = await apiFetch("/api/blocks", { method: "POST", body: JSON.stringify({ userId: thread.other.id, blocked }) });
    if (!res.ok) return toast.error("Something went wrong");
    toast.success(blocked ? `${thread.other.displayName} is blocked.` : `${thread.other.displayName} is unblocked.`);
    setMenuOpen(false);
    await load();
  }

  async function deleteConversation() {
    setMenuOpen(false);
    const ok = await toast.confirm("Delete this conversation from your messages? It comes back if they message you again.", {
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    if (await action({ action: "hide" })) router.push("/messages");
  }

  if (missing) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <h1 className="font-serif text-2xl">Conversation not found</h1>
        <Link href="/messages" className="rounded-lg bg-red px-6 py-3 text-sm font-semibold text-white">
          Back to messages
        </Link>
      </div>
    );
  }
  if (!thread) return <LoadingSpinner full size="lg" />;

  const t = thread;
  const lastMine = [...t.messages].reverse().find((m) => m.fromMe && m.kind !== "SYSTEM");
  const seen = !!(lastMine && t.otherLastReadAt && new Date(t.otherLastReadAt) >= new Date(lastMine.createdAt));
  const canSend = !t.blockedByMe && !t.blockedMe && !t.waitingForAccept;

  return (
    <div className="flex h-[100dvh] flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-line-soft px-3 py-2.5">
        <Link href="/messages" aria-label="Back to messages" className="p-1 text-ink-2">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <Link href={`/u/${t.other.handle}`} className="flex min-w-0 flex-1 items-center gap-2.5">
          <DmAvatar person={t.other} className="h-9 w-9 text-xs" />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">{t.other.displayName}</span>
            <span className="block truncate text-xs text-ink-3">
              {t.disappear.seconds ? `⏱ Disappearing messages · ${t.disappear.label}` : `@${t.other.handle}`}
            </span>
          </span>
        </Link>
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Conversation options" className="p-1 text-ink-2">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
      </div>

      {/* Disappearing-messages proposal waiting for an answer */}
      {t.disappear.pending && (
        <div className="flex items-center gap-3 border-b border-line-soft bg-amber/10 px-4 py-2.5">
          <p className="flex-1 text-[13px]">
            {t.disappear.pending.byMe
              ? `Waiting for ${t.other.displayName} to approve ${t.disappear.pending.seconds ? `disappearing messages (${t.disappear.pending.label})` : "turning off disappearing messages"}.`
              : `${t.other.displayName} wants to ${t.disappear.pending.seconds ? `turn on disappearing messages (${t.disappear.pending.label})` : "turn off disappearing messages"}.`}
          </p>
          {t.disappear.pending.byMe ? (
            <button type="button" onClick={() => action({ action: "disappear-respond", approve: false })} className="text-xs font-semibold text-ink-2">
              Withdraw
            </button>
          ) : (
            <>
              <button type="button" onClick={() => action({ action: "disappear-respond", approve: false })} className="text-xs font-semibold text-ink-2">
                Decline
              </button>
              <button
                type="button"
                onClick={() => action({ action: "disappear-respond", approve: true }, "Disappearing messages updated.")}
                className="rounded-full bg-red px-3 py-1 text-xs font-semibold text-white"
              >
                Approve
              </button>
            </>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4" onClick={() => setSelectedId(null)}>
        {t.messages.length === 0 && <p className="py-10 text-center text-sm text-ink-3">Say hello to {t.other.displayName}.</p>}
        <div className="flex flex-col gap-1.5">
          {t.messages.map((m, i) => {
            const prev = t.messages[i - 1];
            const newDay = !prev || dayOf(prev.createdAt) !== dayOf(m.createdAt);
            return (
              <div key={m.id}>
                {newDay && <p className="my-3 text-center text-[11px] text-ink-3">{dayOf(m.createdAt)}</p>}
                {m.kind === "SYSTEM" ? (
                  <p className="my-1 text-center text-[12px] text-ink-3">⏱ {m.body}</p>
                ) : (
                  <div className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        if (m.fromMe && !m.deleted) setSelectedId((cur) => (cur === m.id ? null : m.id));
                      }}
                      className={`max-w-[78%] rounded-2xl px-3 py-2 ${
                        m.deleted
                          ? "border border-line-soft text-ink-3"
                          : m.fromMe
                            ? "rounded-br-md bg-red text-white"
                            : "rounded-bl-md bg-surface-2 text-ink"
                      }`}
                    >
                      {m.deleted ? (
                        <p className="text-sm italic">Message deleted</p>
                      ) : (
                        <>
                          {m.kind === "IMAGE" && m.imageUrl && (
                            <a href={m.imageUrl} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={m.imageUrl} alt="Photo" className="mb-1 max-h-72 w-full rounded-xl object-cover" />
                            </a>
                          )}
                          {m.kind === "SHARE" && <ShareCardView m={m} />}
                          {m.body && <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>}
                        </>
                      )}
                      <p className={`mt-0.5 text-right text-[10px] ${m.fromMe && !m.deleted ? "text-white/70" : "text-ink-3"}`}>
                        {m.expiresAt && "⏱ "}
                        {timeOf(m.createdAt)}
                      </p>
                    </div>
                  </div>
                )}
                {selectedId === m.id && (
                  <div className="mt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => deleteMessage(m.id)}
                      className="rounded-full border border-red-soft px-3 py-1 text-xs font-semibold text-red-soft"
                    >
                      Delete for everyone
                    </button>
                  </div>
                )}
                {lastMine?.id === m.id && seen && <p className="mt-0.5 text-right text-[11px] text-ink-3">Seen</p>}
              </div>
            );
          })}
        </div>
        <div ref={endRef} />
      </div>

      {/* Request / blocked / waiting states, then the composer */}
      {t.myStatus === "REQUEST" && !t.blockedByMe ? (
        <div className="border-t border-line-soft px-4 py-3">
          <p className="mb-3 text-center text-[13px] text-ink-2">
            {t.other.displayName} wants to send you a message. They won&apos;t know you&apos;ve seen it until you accept.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setBlock(true)} className="flex-1 rounded-lg border border-line py-2.5 text-sm font-semibold text-red-soft">
              Block
            </button>
            <button
              type="button"
              onClick={async () => {
                if (await action({ action: "hide" })) router.push("/messages");
              }}
              className="flex-1 rounded-lg border border-line py-2.5 text-sm font-semibold"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => action({ action: "accept" }, "Request accepted.")}
              className="flex-1 rounded-lg bg-red py-2.5 text-sm font-semibold text-white"
            >
              Accept
            </button>
          </div>
        </div>
      ) : !canSend ? (
        <div className="border-t border-line-soft px-4 py-4 text-center text-[13px] text-ink-3">
          {t.blockedByMe ? (
            <>
              You blocked {t.other.displayName}.{" "}
              <button type="button" onClick={() => setBlock(false)} className="font-semibold text-red-soft">
                Unblock
              </button>
            </>
          ) : t.blockedMe ? (
            "You can't reply to this conversation."
          ) : (
            `Message request sent. You can send more once ${t.other.displayName} accepts.`
          )}
        </div>
      ) : (
        <form
          className="flex items-end gap-2 border-t border-line-soft px-3 py-2.5 pb-[max(env(safe-area-inset-bottom),10px)]"
          onSubmit={(e) => {
            e.preventDefault();
            void sendText();
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void sendImage(f);
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={sending} aria-label="Send a photo" className="p-2 text-ink-2 disabled:opacity-40">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <circle cx="9" cy="10" r="1.6" />
              <path d="M21 16l-5-5-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendText();
              }
            }}
            rows={1}
            placeholder="Message…"
            enterKeyHint="send"
            className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm outline-none focus:border-red"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            aria-label="Send"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-red text-white disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
      )}

      {/* Options */}
      {menuOpen && (
        <BottomSheet onClose={() => setMenuOpen(false)}>
          <div className="flex flex-col divide-y divide-white/10">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setDisappearOpen(true);
              }}
              className="py-3.5 text-left text-[15px]"
            >
              Disappearing messages <span className="text-ink-3">· {t.disappear.label}</span>
            </button>
            <Link href={`/u/${t.other.handle}`} className="py-3.5 text-[15px]">
              View profile
            </Link>
            <button type="button" onClick={() => setBlock(!t.blockedByMe)} className="py-3.5 text-left text-[15px] text-red-soft">
              {t.blockedByMe ? `Unblock ${t.other.displayName}` : `Block ${t.other.displayName}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setReportOpen(true);
              }}
              className="py-3.5 text-left text-[15px] text-red-soft"
            >
              Report conversation
            </button>
            <button type="button" onClick={deleteConversation} className="py-3.5 text-left text-[15px] text-red-soft">
              Delete conversation
            </button>
          </div>
        </BottomSheet>
      )}

      {disappearOpen && (
        <BottomSheet onClose={() => setDisappearOpen(false)}>
          <h2 className="mb-1 font-serif text-[24px] leading-tight">Disappearing messages</h2>
          <p className="mb-4 text-sm text-ink-3">
            New messages disappear for both of you after the time you pick. {t.other.displayName} has to approve the change first.
          </p>
          <div className="flex flex-col divide-y divide-white/10">
            {[...DISAPPEAR_CHOICES, { seconds: 0, label: "Off" }].map((c) => {
              const current = (t.disappear.seconds ?? 0) === c.seconds;
              return (
                <button
                  key={c.seconds}
                  type="button"
                  disabled={current || !!t.disappear.pending || !canSend}
                  onClick={async () => {
                    setDisappearOpen(false);
                    await action(
                      { action: "disappear-propose", seconds: c.seconds },
                      `Asked ${t.other.displayName} to ${c.seconds ? `turn on disappearing messages (${c.label})` : "turn off disappearing messages"}.`,
                    );
                  }}
                  className="flex items-center justify-between py-3.5 text-left text-[15px] disabled:opacity-50"
                >
                  {c.label}
                  {current && <span className="text-xs font-semibold text-red-soft">Current</span>}
                </button>
              );
            })}
          </div>
          {t.disappear.pending && <p className="mt-3 text-xs text-amber">A change is already waiting for an answer.</p>}
        </BottomSheet>
      )}

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="CONVERSATION"
        targetId={t.id}
        reasons={[{ value: "INAPPROPRIATE_CONTENT", label: "Harassment, spam or inappropriate messages" }]}
        title="Report conversation"
        detailsPlaceholder="What happened? Moderators will be able to read this conversation."
      />
    </div>
  );
}
