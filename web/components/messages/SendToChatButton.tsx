"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { BottomSheet } from "@/components/live/BottomSheet";
import { DmAvatar } from "./Avatar";
import type { DmConversationRow, DmPerson, DmShareTarget } from "./types";

// "Send" on a product, event or Live (direct messages, explicit ask
// 2026-10-04): pick a recent chat or search for anyone, add an optional
// note, and it arrives as a tappable card.
export function SendToChatButton({ share, className = "text-xs text-ink-3" }: { share: DmShareTarget; className?: string }) {
  const { appUser } = useAuth();
  const [open, setOpen] = useState(false);
  if (!appUser) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Send
      </button>
      {open && <SendToChatSheet share={share} onClose={() => setOpen(false)} />}
    </>
  );
}

export function SendToChatSheet({ share, onClose }: { share: DmShareTarget; onClose: () => void }) {
  const toast = useToast();
  const [recent, setRecent] = useState<DmConversationRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DmPerson[]>([]);
  const [note, setNote] = useState("");
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/messages?box=inbox")
      .then((res) => (res.ok ? res.json() : { conversations: [] }))
      .then((data) => setRecent(data.conversations))
      .catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = setTimeout(() => {
      apiFetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : { creators: [] }))
        .then((data) => setResults(data.creators ?? []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  async function send(person: DmPerson) {
    setBusyId(person.id);
    try {
      const res = await apiFetch("/api/messages", {
        method: "POST",
        body: JSON.stringify({ toUserId: person.id, message: { kind: "SHARE", share, body: note.trim() || undefined } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't send");
      }
      setSentTo((cur) => new Set(cur).add(person.id));
      toast.success(`Sent to ${person.displayName}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setBusyId(null);
    }
  }

  const people: DmPerson[] =
    query.trim().length >= 2 ? results : (recent ?? []).map((c) => c.other).filter((p): p is DmPerson => !!p);

  return (
    <BottomSheet onClose={onClose}>
      <h2 className="mb-3 font-serif text-[24px] leading-tight">Send to</h2>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search people"
        className="mb-3 w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-red"
      />
      <div className="max-h-[45vh] overflow-y-auto">
        {recent === null && query.trim().length < 2 ? (
          <p className="py-6 text-center text-sm text-ink-3">Loading…</p>
        ) : people.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-3">{query.trim().length >= 2 ? "No one found." : "Search for someone to send this to."}</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {people.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <DmAvatar person={p} className="h-9 w-9 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px]">{p.displayName}</p>
                  <p className="truncate text-xs text-ink-3">@{p.handle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => send(p)}
                  disabled={busyId === p.id || sentTo.has(p.id)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                    sentTo.has(p.id) ? "border border-white/20 text-ink-2" : "bg-red text-white"
                  }`}
                >
                  {sentTo.has(p.id) ? "Sent" : "Send"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 500))}
        placeholder="Add a message (optional)"
        className="mt-3 w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-red"
      />
    </BottomSheet>
  );
}
