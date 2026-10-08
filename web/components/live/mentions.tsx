"use client";

import { FallbackImg } from "@/components/ui/FallbackImg";
import { InitialsAvatar } from "@/components/live/LiveCard";

// @-mentions in Live chat (explicit ask, 2026-10-04: "live host can tag a
// user in the live comments"). The host types "@", picks someone who's in
// the Live, and the chat message carries who was tagged. Chat rides the
// LiveKit data channel straight from clients, so receivers only honour
// mentions on a message whose sending participant *is* the host — anyone
// else's "@name" is just text.

export type ChatMention = { userId: string; handle: string; displayName: string };
export type MentionCandidate = ChatMention & { avatarUrl: string | null };

/** The "@partial" being typed at the end of the input, if any. */
export function activeMentionQuery(text: string): string | null {
  const match = /(?:^|\s)@([\w.]*)$/.exec(text);
  return match ? match[1].toLowerCase() : null;
}

export function filterCandidates(candidates: MentionCandidate[], query: string): MentionCandidate[] {
  return candidates
    .filter((c) => c.handle && (c.handle.toLowerCase().startsWith(query) || c.displayName.toLowerCase().includes(query)))
    .slice(0, 6);
}

/** Replaces the trailing "@partial" with the chosen "@handle ". */
export function insertMention(text: string, candidate: MentionCandidate): string {
  return text.replace(/@([\w.]*)$/, `@${candidate.handle} `);
}

/** Who is actually tagged in the final text — only candidates whose @handle appears. */
export function extractMentions(text: string, candidates: MentionCandidate[]): ChatMention[] {
  const seen = new Set<string>();
  const out: ChatMention[] = [];
  for (const c of candidates) {
    if (!c.handle || seen.has(c.userId)) continue;
    const re = new RegExp(`(^|\\s)@${c.handle.replace(/[.]/g, "\\.")}(?=$|[\\s.,!?])`, "i");
    if (re.test(text)) {
      seen.add(c.userId);
      out.push({ userId: c.userId, handle: c.handle, displayName: c.displayName });
    }
  }
  return out;
}

/**
 * Chat text with each tagged person highlighted — shown by display name
 * ("@XaintLeo"), not the @handle that was typed (explicit ask, 2026-10-05:
 * people are known by display name throughout a Live).
 */
export function MentionText({ text, mentions }: { text: string; mentions?: ChatMention[] }) {
  if (!mentions || mentions.length === 0) return <>{text}</>;
  const nameByHandle = new Map(mentions.map((m) => [m.handle.toLowerCase(), m.displayName]));
  const parts = text.split(/(@[\w.]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") && nameByHandle.has(part.slice(1).toLowerCase()) ? (
          <span key={i} className="font-semibold text-amber">
            @{nameByHandle.get(part.slice(1).toLowerCase())}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** The pick-list shown above the chat box while the host is typing "@…". */
export function MentionSuggestions({
  candidates,
  onPick,
}: {
  candidates: MentionCandidate[];
  onPick: (c: MentionCandidate) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <ul className="mx-3 mb-2 overflow-hidden rounded-xl border border-white/15 bg-black/80 backdrop-blur-sm">
      {candidates.map((c) => (
        <li key={c.userId}>
          <button
            type="button"
            // onMouseDown keeps focus in the input on desktop.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(c)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-white/10"
          >
            <FallbackImg
              src={c.avatarUrl}
              alt={c.displayName}
              className="h-7 w-7 shrink-0 rounded-full object-cover"
              fallback={<InitialsAvatar name={c.displayName || "?"} className="h-7 w-7 text-[10px]" />}
            />
            <span className="min-w-0 flex-1 truncate text-[14px] text-white">{c.displayName}</span>
            <span className="shrink-0 text-[12px] text-white/90">@{c.handle}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
