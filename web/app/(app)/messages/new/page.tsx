"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { DmAvatar } from "@/components/messages/Avatar";
import type { DmPerson } from "@/components/messages/types";

// First message to someone you haven't messaged before (direct messages,
// explicit ask 2026-10-04). If a conversation already exists it jumps
// straight there; sending creates it and moves to the real conversation.
function NewMessage() {
  const search = useSearchParams();
  const to = search.get("to");
  const router = useRouter();
  const toast = useToast();
  const { firebaseUser, loading: authLoading } = useAuth();
  const [person, setPerson] = useState<DmPerson | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "blocked" | "missing">("loading");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.push(`/login?next=/messages/new?to=${to ?? ""}`);
      return;
    }
    if (!to) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no recipient in the link
      setState("missing");
      return;
    }
    apiFetch(`/api/messages/with/${to}`)
      .then(async (res) => {
        if (!res.ok) return setState("missing");
        const data: { user: DmPerson; conversationId: string | null; blockedByMe: boolean; blockedMe: boolean } = await res.json();
        if (data.conversationId) return router.replace(`/messages/${data.conversationId}`);
        setPerson(data.user);
        setState(data.blockedByMe || data.blockedMe ? "blocked" : "ready");
      })
      .catch(() => setState("missing"));
  }, [authLoading, firebaseUser, router, to]);

  async function send() {
    const body = text.trim();
    if (!body || !person || sending) return;
    setSending(true);
    try {
      const res = await apiFetch("/api/messages", {
        method: "POST",
        body: JSON.stringify({ toUserId: person.id, message: { kind: "TEXT", body } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't send");
      router.replace(`/messages/${data.conversationId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send");
      setSending(false);
    }
  }

  if (state === "loading") return <LoadingSpinner full size="lg" />;
  if (state === "missing" || !person) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <h1 className="font-serif text-2xl">That account isn&apos;t available</h1>
        <Link href="/messages" className="rounded-lg bg-red px-6 py-3 text-sm font-semibold text-white">
          Back to messages
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col">
      <div className="flex items-center gap-3 border-b border-line-soft px-3 py-2.5">
        <Link href="/messages" aria-label="Back to messages" className="p-1 text-ink-2">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <Link href={`/u/${person.handle}`} className="flex min-w-0 items-center gap-2.5">
          <DmAvatar person={person} className="h-9 w-9 text-xs" />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">{person.displayName}</span>
            <span className="block truncate text-xs text-ink-3">@{person.handle}</span>
          </span>
        </Link>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <DmAvatar person={person} className="h-20 w-20 text-2xl" />
        <p className="text-lg font-semibold">{person.displayName}</p>
        <p className="max-w-xs text-sm text-ink-3">
          {state === "blocked"
            ? "You can't message this person."
            : "If they don't follow you, your message arrives as a request — you can send more once they accept."}
        </p>
      </div>

      {state === "ready" && (
        <form
          className="flex items-end gap-2 border-t border-line-soft px-3 py-2.5 pb-[max(env(safe-area-inset-bottom),10px)]"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            value={text}
            autoFocus
            onChange={(e) => setText(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={`Message ${person.displayName}…`}
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
    </div>
  );
}

export default function NewMessagePage() {
  return (
    <Suspense fallback={<LoadingSpinner full size="lg" />}>
      <NewMessage />
    </Suspense>
  );
}
