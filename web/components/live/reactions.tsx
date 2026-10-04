"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Live emoji reactions (explicit ask, 2026-10-04: "some emojis should be on
// screen in the live and it should be filtered according to what the user
// normally uses"). Tapping one sends it to everyone on the room's "reaction"
// data topic and floats it up the right edge. The bar's order is personal:
// every emoji this person sends — as a reaction or typed in chat — is
// counted in this browser's localStorage, and the most-used come first.
// Losing that (private window, cleared data) just falls back to the default
// order, so it never needs to be anywhere more durable.

export const LIVE_EMOJIS = ["❤️", "🔥", "😂", "👏", "😍", "🙌", "💯", "😮", "🎉", "🙏", "😭", "🥳", "💃", "🎶", "👀", "🤯"] as const;

// How many sit on the bar before the "+" opens the rest.
const BAR_SIZE = 6;
const STORAGE_KEY = "xoldout:live-emoji-usage";
// Per-sender cap so one person can't flood everyone's screen.
const MAX_REACTIONS_PER_SECOND = 8;

type Usage = Record<string, number>;

function readUsage(): Usage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Usage) : {};
  } catch {
    return {};
  }
}

function writeUsage(usage: Usage) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  } catch {
    // Storage blocked — ordering just won't be remembered.
  }
}

/** Most-used first; ties (and never-used) keep the default order. */
function orderByUsage(usage: Usage): string[] {
  return [...LIVE_EMOJIS].sort((a, b) => (usage[b] ?? 0) - (usage[a] ?? 0) || LIVE_EMOJIS.indexOf(a) - LIVE_EMOJIS.indexOf(b));
}

// Only the bar's own emojis affect its order, so chat text is scanned for just
// those — no Unicode-property regex, which not every JS engine supports.
function emojisIn(text: string): string[] {
  const found: string[] = [];
  for (const e of LIVE_EMOJIS) {
    const bare = e.replace("️", "");
    const count = text.split(bare).length - 1;
    for (let i = 0; i < count; i++) found.push(e);
  }
  return found;
}

/** The person's emoji order, plus a way to count uses (reactions, and emojis typed in chat). */
export function useEmojiUsage() {
  const [ordered, setOrdered] = useState<string[]>([...LIVE_EMOJIS]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage once on mount (unavailable during SSR)
    setOrdered(orderByUsage(readUsage()));
  }, []);

  const recordUse = useCallback((emojis: string[]) => {
    if (emojis.length === 0) return;
    const usage = readUsage();
    for (const e of emojis) usage[e] = (usage[e] ?? 0) + 1;
    writeUsage(usage);
    setOrdered(orderByUsage(usage));
  }, []);

  /** Counts every emoji in a chat message the person just sent. */
  const recordFromText = useCallback((text: string) => recordUse(emojisIn(text)), [recordUse]);

  return { ordered, recordUse, recordFromText };
}

type Floating = { id: string; emoji: string; left: number; drift: number };

/** Emojis rising up the right side. `push` adds one (local or received). */
export function useFloatingReactions() {
  const [items, setItems] = useState<Floating[]>([]);
  const push = useCallback((emoji: string) => {
    const id = crypto.randomUUID();
    setItems((cur) => [...cur.slice(-30), { id, emoji, left: Math.random() * 40, drift: (Math.random() - 0.5) * 60 }]);
    setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== id)), 2700);
  }, []);
  return { items, push };
}

export function FloatingReactions({ items }: { items: Floating[] }) {
  return (
    <div className="pointer-events-none absolute bottom-40 right-2 z-20 h-0 w-20" aria-hidden>
      {items.map((i) => (
        <span
          key={i.id}
          className="animate-reaction-float absolute bottom-0 text-[30px] leading-none"
          style={{ left: i.left, ["--drift" as string]: `${i.drift}px` }}
        >
          {i.emoji}
        </span>
      ))}
    </div>
  );
}

/** Drops anything over MAX_REACTIONS_PER_SECOND from one sender, per rolling second. */
export function useReactionRateLimit() {
  const seen = useRef(new Map<string, number[]>());
  return useCallback((senderId: string) => {
    const now = Date.now();
    const recent = (seen.current.get(senderId) ?? []).filter((t) => now - t < 1000);
    if (recent.length >= MAX_REACTIONS_PER_SECOND) return false;
    recent.push(now);
    seen.current.set(senderId, recent);
    return true;
  }, []);
}

export function ReactionBar({ ordered, onReact }: { ordered: string[]; onReact: (emoji: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? ordered : ordered.slice(0, BAR_SIZE);
  return (
    <div className="mx-3 mt-2 flex flex-wrap items-center gap-1">
      {shown.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          aria-label={`React ${emoji}`}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-[20px] backdrop-blur-sm transition-transform active:scale-90"
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Fewer emojis" : "More emojis"}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-[18px] font-semibold text-white backdrop-blur-sm"
      >
        {expanded ? "–" : "+"}
      </button>
    </div>
  );
}
