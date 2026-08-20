"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { FanbaseRow, timeAgo, type FanbaseRowData } from "./FanbaseRow";
import { CreateFanbaseSheet } from "./CreateFanbaseSheet";

type Group = FanbaseRowData & { creatorId: string };

export function FanbaseTab() {
  const router = useRouter();
  const { appUser } = useAuth();
  const [mine, setMine] = useState<Group[] | null>(null);
  const [discover, setDiscover] = useState<Group[] | null>(null);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [joining, setJoining] = useState<string | null>(null);

  async function load(q?: string) {
    const suffix = q ? `?q=${encodeURIComponent(q)}` : "";
    const [mineRes, discoverRes] = await Promise.all([
      apiFetch(`/api/groups${suffix}`),
      apiFetch(`/api/groups?discover=1${q ? `&q=${encodeURIComponent(q)}` : ""}`),
    ]);
    setMine((await mineRes.json()).groups ?? []);
    setDiscover((await discoverRes.json()).groups ?? []);
  }

  useEffect(() => {
    async function initialLoad() {
      const [mineRes, discoverRes] = await Promise.all([apiFetch("/api/groups"), apiFetch("/api/groups?discover=1")]);
      setMine((await mineRes.json()).groups ?? []);
      setDiscover((await discoverRes.json()).groups ?? []);
    }
    initialLoad();
  }, []);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    load(query.trim() || undefined);
  }

  async function handleRequestJoin(groupId: string, visibility: "OPEN" | "REQUEST_TO_JOIN") {
    setJoining(groupId);
    try {
      const res = await apiFetch(`/api/groups/${groupId}/join`, { method: "POST" });
      if (res.ok) {
        if (visibility === "OPEN") {
          router.push(`/groups/${groupId}`);
        } else {
          setRequested((cur) => new Set(cur).add(groupId));
        }
      }
    } finally {
      setJoining(null);
    }
  }

  if (mine === null || discover === null) return <LoadingSpinner full size="md" />;

  const owned = mine.filter((g) => g.creatorId === appUser?.id);
  const joined = mine.filter((g) => g.creatorId !== appUser?.id);
  const toDiscover = discover.filter((g) => !mine.some((m) => m.id === g.id));

  return (
    <div>
      <p className="text-xs text-ink-3 mb-4">Private groups for your biggest fans — create your own, or request to join one.</p>

      <form onSubmit={handleSearchSubmit} className="mb-6">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Fanbase groups"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
        </div>
      </form>

      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3">My Fanbase</h2>
        <button type="button" onClick={() => setShowCreate(true)} className="text-xs font-semibold text-red-soft">
          + Create
        </button>
      </div>
      {owned.length === 0 ? (
        <p className="text-sm text-ink-3 py-2 mb-4">You haven&apos;t started a Fanbase yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft mb-4">
          {owned.map((g, i) => (
            <FanbaseRow key={g.id} group={g} index={i} subtitle={`${g.memberCount} member${g.memberCount === 1 ? "" : "s"} · You own this`} />
          ))}
        </div>
      )}

      <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-1">Joined</h2>
      {joined.length === 0 ? (
        <p className="text-sm text-ink-3 py-2 mb-4">Groups you join will show up here.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft mb-4">
          {joined.map((g, i) => (
            <FanbaseRow
              key={g.id}
              group={g}
              index={i}
              subtitle={`${g.memberCount} member${g.memberCount === 1 ? "" : "s"} · ${g.lastActivityAt ? `Active ${timeAgo(g.lastActivityAt)}` : "No activity yet"}`}
              action={
                <a
                  href={`/groups/${g.id}`}
                  className="shrink-0 rounded-lg bg-red px-4 py-1.5 text-xs font-semibold text-white"
                >
                  Enter
                </a>
              }
            />
          ))}
        </div>
      )}

      <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-1">Discover</h2>
      {toDiscover.length === 0 ? (
        <p className="text-sm text-ink-3 py-2">Nothing to discover yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft">
          {toDiscover.map((g, i) => (
            <FanbaseRow
              key={g.id}
              group={g}
              index={i}
              subtitle={`${g.memberCount} member${g.memberCount === 1 ? "" : "s"} · ${g.visibility === "REQUEST_TO_JOIN" ? "private circle" : "open"}`}
              action={
                requested.has(g.id) || g.joinRequestPending ? (
                  <span className="shrink-0 text-xs text-ink-3">Requested</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRequestJoin(g.id, g.visibility)}
                    disabled={joining === g.id}
                    className="shrink-0 rounded-lg border border-red text-red-soft px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    {g.visibility === "OPEN" ? "Join" : "Request to Join"}
                  </button>
                )
              }
            />
          ))}
        </div>
      )}

      <CreateFanbaseSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(groupId) => {
          setShowCreate(false);
          router.push(`/groups/${groupId}`);
        }}
      />
    </div>
  );
}
