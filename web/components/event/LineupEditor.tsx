"use client";

import { useState } from "react";
import { UserHandleAutocomplete, type UserSuggestion } from "@/components/ui/UserHandleAutocomplete";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { MAX_LINEUP, LINEUP_ROLES, LINEUP_ROLE_LABEL } from "@/lib/event/lineupRules";

export type LineupDraft = { user: UserSuggestion; role: string; status?: string };

/** The API payload for these drafts. */
export function lineupPayload(drafts: LineupDraft[]) {
  return drafts.map((d) => ({ userId: d.user.id, role: d.role }));
}

/**
 * Event lineup picker (v2, design/v2-prototype): XOLDOUT profiles only, found
 * through the same search as featured artists; order is the display order.
 * Each performer gets a role and an invitation to accept (2026-11-11).
 */
export function LineupEditor({ value, onChange }: { value: LineupDraft[]; onChange: (v: LineupDraft[]) => void }) {
  const [query, setQuery] = useState("");

  function move(i: number, by: -1 | 1) {
    const j = i + by;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-3">
        Only people with XOLDOUT accounts can be added. Each gets an invitation and shows on the event once they accept.
      </p>
      {value.map((d, i) => (
        <div key={d.user.id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-3 py-2">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface-2">
              <FallbackImg src={d.user.avatarUrl} alt={d.user.displayName} className="h-full w-full object-cover" fallback={null} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{d.user.displayName}</p>
              <p className="truncate text-xs text-ink-3">
                @{d.user.handle}
                {d.status && d.status !== "ACCEPTED" && (
                  <span className={d.status === "DECLINED" ? " text-red-soft" : " text-amber"}> · {d.status === "DECLINED" ? "Declined" : "Invited"}</span>
                )}
              </p>
            </div>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${d.user.displayName} up`} className="px-1 text-ink-3 disabled:opacity-30">
              ↑
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label={`Move ${d.user.displayName} down`} className="px-1 text-ink-3 disabled:opacity-30">
              ↓
            </button>
            <button type="button" onClick={() => onChange(value.filter((x) => x.user.id !== d.user.id))} aria-label={`Remove ${d.user.displayName}`} className="text-xs text-ink-3">
              Remove
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LINEUP_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onChange(value.map((x) => (x.user.id === d.user.id ? { ...x, role: r } : x)))}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${d.role === r ? "border-red bg-red/10 text-red-soft" : "border-line text-ink-2"}`}
              >
                {LINEUP_ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
      ))}
      {value.length < MAX_LINEUP && (
        <UserHandleAutocomplete
          value={query}
          onChange={setQuery}
          placeholder="Search XOLDOUT profiles"
          className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-red"
          onSelect={(u) => {
            setQuery("");
            if (!value.some((x) => x.user.id === u.id)) onChange([...value, { user: u, role: value.length === 0 ? "HEADLINER" : "ARTIST" }]);
          }}
        />
      )}
    </div>
  );
}
