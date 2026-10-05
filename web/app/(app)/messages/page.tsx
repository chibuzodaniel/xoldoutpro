"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { BackHeader } from "@/components/ui/BackHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { DmAvatar } from "@/components/messages/Avatar";
import type { DmConversationRow, DmPerson } from "@/components/messages/types";

// Direct messages inbox (explicit ask, 2026-10-04) — Inbox / Requests tabs,
// and "New message" to search for anyone. Refreshes every 10s while visible.

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

export default function MessagesPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<"inbox" | "requests">("inbox");
  const [rows, setRows] = useState<Record<"inbox" | "requests", DmConversationRow[] | null>>({ inbox: null, requests: null });
  const [composing, setComposing] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DmPerson[]>([]);

  const load = useCallback(async () => {
    const [inbox, requests] = await Promise.all(
      (["inbox", "requests"] as const).map((box) =>
        apiFetch(`/api/messages?box=${box}`)
          .then((res) => (res.ok ? res.json() : { conversations: [] }))
          .then((d) => d.conversations as DmConversationRow[])
          .catch(() => [] as DmConversationRow[]),
      ),
    );
    setRows({ inbox, requests });
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.push("/login?next=/messages");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load, then a slow refresh while visible
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const id = setInterval(refresh, 10_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [authLoading, firebaseUser, load, router]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = setTimeout(() => {
      apiFetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : { creators: [] }))
        .then((d) => setResults(d.creators ?? []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  const list = rows[tab];
  const requestCount = rows.requests?.length ?? 0;

  return (
    <div className="pb-10">
      <BackHeader
        title="Messages"
        action={
          <button type="button" onClick={() => setComposing((v) => !v)} className="shrink-0 text-xs font-semibold text-red-soft">
            {composing ? "Cancel" : "New message"}
          </button>
        }
      />
      <div className="px-4">
        {composing && (
          <div className="mb-5">
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for someone to message"
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-red"
            />
            {query.trim().length >= 2 && (
              <ul className="mt-2 divide-y divide-line-soft border-y border-line-soft">
                {results.length === 0 ? (
                  <li className="py-3 text-center text-sm text-ink-3">No one found.</li>
                ) : (
                  results.map((p) => (
                    <li key={p.id}>
                      <Link href={`/messages/new?to=${p.id}`} className="flex items-center gap-3 py-2.5">
                        <DmAvatar person={p} className="h-9 w-9 text-xs" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{p.displayName}</p>
                          <p className="truncate text-xs text-ink-3">@{p.handle}</p>
                        </div>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        )}

        <div className="mb-3 flex items-center gap-4 border-b border-line-soft">
          {(["inbox", "requests"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`border-b-2 pb-2.5 text-[14px] font-semibold ${tab === t ? "border-red text-white" : "border-transparent text-ink-3"}`}
            >
              {t === "inbox" ? "Inbox" : `Requests${requestCount ? ` (${requestCount})` : ""}`}
            </button>
          ))}
        </div>

        {list === null ? (
          <LoadingSpinner full size="md" />
        ) : list.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-semibold">{tab === "inbox" ? "No messages yet" : "No message requests"}</p>
            <p className="mt-1 text-xs text-ink-3">
              {tab === "inbox"
                ? "Message someone from their profile, or tap New message."
                : "Messages from people you don't follow show up here first."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line-soft">
            {list.map((c) =>
              c.other ? (
                <li key={c.id}>
                  <Link href={`/messages/${c.id}`} className="flex items-center gap-3 py-3">
                    <DmAvatar person={c.other} className="h-12 w-12 text-base" />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[15px] ${c.unread ? "font-bold text-white" : "font-semibold"}`}>{c.other.displayName}</p>
                      <p className={`truncate text-[13px] ${c.unread ? "font-semibold text-ink" : "text-ink-3"}`}>
                        {c.lastMessage ? `${c.lastMessage.fromMe ? "You: " : ""}${c.lastMessage.preview}` : "Say hello"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[11px] text-ink-3">{timeAgo(c.lastMessageAt)}</span>
                      {c.unread > 0 && (
                        <span className="min-w-[18px] rounded-full bg-red px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                          {c.unread > 99 ? "99+" : c.unread}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              ) : null,
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
