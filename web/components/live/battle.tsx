"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { InitialsAvatar } from "@/components/live/LiveCard";
import { BottomSheet } from "@/components/live/BottomSheet";
import { XgCoin } from "@/components/live/LiveIcons";
import type { StagePerson } from "@/components/live/stage";

// Live battles (rap battles etc. — explicit ask, 2026-10-08), shared by the
// host's broadcast page and the viewer page. See lib/live/battle.ts for the
// rules. The battle is read once when the Live opens and again only when the
// room announces a "battle" live-event — no polling (Vercel CPU budget, see
// CLAUDE.md). Countdowns run locally from the stored end time.

export type BattlePerson = { id: string; handle: string; displayName: string; avatarUrl: string | null };

export type BattleCompetitor = {
  id: string;
  user: BattlePerson;
  position: number;
  giftsXg: number;
  votes: number | null;
  score: number | null;
  place: number | null;
  prizeXg: number;
  supporters: { person: BattlePerson; xg: number }[];
  supporterCount: number;
};

export type Battle = {
  id: string;
  liveSessionId: string;
  liveTitle: string;
  title: string;
  status: "READY" | "IN_PROGRESS" | "VOTING" | "FINISHED" | "CANCELLED";
  host: BattlePerson;
  rounds: number;
  turnSeconds: number;
  votingSeconds: number;
  prizePlaces: number[];
  prizeXg: number;
  startedAt: string | null;
  finishedAt: string | null;
  votingEndsAt: string | null;
  currentTurn: { id: string; competitorId: string; round: number; startedAt: string; endsAt: string } | null;
  turnsDone: number;
  turnsTotal: number;
  myVoteCompetitorId: string | null;
  canVote: boolean;
  competitors: BattleCompetitor[];
  turns: { id: string; competitorId: string; round: number; startedAt: string; endedAt: string | null; seconds: number | null }[];
  totalVotes: number | null;
  serverTime: string;
};

export function isBattleEvent(data: unknown): boolean {
  return (data as { kind?: unknown } | null)?.kind === "battle";
}

export function isBattleActive(b: Battle | null): b is Battle {
  return !!b && (b.status === "IN_PROGRESS" || b.status === "VOTING");
}

/** Show the strip while it runs, and the result for 10 minutes after (until dismissed). */
export function isBattleShown(b: Battle | null): b is Battle {
  if (!b || b.status === "CANCELLED") return false;
  if (b.status !== "FINISHED") return true;
  return !!b.finishedAt && new Date(b.serverTime).getTime() - new Date(b.finishedAt).getTime() < 10 * 60_000;
}

export function useBattle(liveId: string, enabled: boolean) {
  const [battle, setBattle] = useState<Battle | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Server clock minus ours, so every phone's countdown agrees.
  const [skewMs, setSkewMs] = useState(0);
  const refresh = useCallback(async () => {
    const res = await apiFetch(`/api/live/${liveId}/battle`).catch(() => null);
    if (!res?.ok) return;
    const data: { battle: Battle | null } = await res.json();
    setBattle(data.battle);
    setLoaded(true);
    if (data.battle) setSkewMs(new Date(data.battle.serverTime).getTime() - Date.now());
  }, [liveId]);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load once connected
    void refresh();
  }, [enabled, refresh]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await apiFetch(`/api/live/${liveId}/battle`, { method: "POST", body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error ?? "Something went wrong"), { insufficientXg: !!data.insufficientXg });
      setBattle(data.battle ?? null);
      return data.battle as Battle | null;
    },
    [liveId],
  );

  // A gift to a competitor arrives on the room's "live-event" topic with its
  // competitorId — add it here rather than re-reading the battle per gift.
  const bumpGift = useCallback((competitorId: string, xg: number) => {
    setBattle((b) =>
      b ? { ...b, competitors: b.competitors.map((c) => (c.id === competitorId ? { ...c, giftsXg: c.giftsXg + xg } : c)) } : b,
    );
  }, []);

  const dismiss = useCallback(() => setBattle(null), []);

  return { battle, loaded, skewMs, refresh, act, bumpGift, dismiss };
}

function useCountdown(endsAt: string | null | undefined, skewMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - (now + skewMs)) / 1000));
}

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Avatar({ person, className }: { person: BattlePerson; className: string }) {
  return (
    <FallbackImg
      src={person.avatarUrl}
      alt={person.displayName}
      className={`${className} shrink-0 rounded-full object-cover`}
      fallback={<InitialsAvatar name={person.displayName} className={`${className} text-[11px]`} />}
    />
  );
}

const PLACE = ["1st", "2nd", "3rd", "4th"];

/**
 * The battle strip over the Live: title, round, whose turn it is with a
 * countdown, each competitor's gift XG (tap to support them), the vote while
 * it's open, and the result once it's done. The host also gets the controls.
 */
export function BattleBar({
  battle,
  skewMs,
  isHost,
  act,
  onSupport,
  onOpenDetails,
  onDismiss,
}: {
  onDismiss?: () => void;
  battle: Battle;
  skewMs: number;
  isHost: boolean;
  act: (body: Record<string, unknown>) => Promise<Battle | null>;
  onSupport?: (competitorId: string) => void;
  onOpenDetails: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const turnLeft = useCountdown(battle.currentTurn?.endsAt, skewMs);
  const voteLeft = useCountdown(battle.status === "VOTING" ? battle.votingEndsAt : null, skewMs);

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      try {
        await act(body);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    },
    [act, toast],
  );

  // The host's screen closes a turn / the vote when its time runs out (the
  // server also does it on the next read, in case the host dropped).
  const autoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isHost) return;
    if (battle.currentTurn && turnLeft === 0 && autoRef.current !== battle.currentTurn.id) {
      autoRef.current = battle.currentTurn.id;
      void run({ action: "end-turn" });
    }
    if (battle.status === "VOTING" && voteLeft === 0 && autoRef.current !== `vote-${battle.id}`) {
      autoRef.current = `vote-${battle.id}`;
      void run({ action: "finish" });
    }
  }, [isHost, battle, turnLeft, voteLeft, run]);

  const performer = battle.currentTurn ? battle.competitors.find((c) => c.id === battle.currentTurn!.competitorId) : null;
  const n = battle.competitors.length || 1;
  const nextIndex = battle.turnsDone % n;
  const nextRound = Math.floor(battle.turnsDone / n) + 1;
  const allTurnsDone = battle.turnsDone >= battle.turnsTotal;
  const finished = battle.status === "FINISHED";
  const winners = finished ? battle.competitors.filter((c) => c.place !== null).sort((a, b) => a.place! - b.place!) : [];

  return (
    <div className="relative mt-2 rounded-2xl border border-amber/30 bg-black/60 p-2.5 backdrop-blur-sm">
      <button type="button" onClick={onOpenDetails} className="flex w-full items-center gap-2 text-left">
        <span className="rounded-md bg-amber px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">Battle</span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">{battle.title}</span>
        {battle.prizeXg > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-amber">
            <XgCoin className="h-3.5 w-3.5" />
            {battle.prizeXg.toLocaleString("en-NG")} prize
          </span>
        )}
      </button>
      {finished && onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Hide the battle result" className="absolute right-2 top-1.5 px-1 text-[16px] text-white/60">
          ×
        </button>
      )}

      <p className="mt-1 text-[12px] text-white/70">
        {battle.status === "READY" && "Getting ready…"}
        {battle.status === "IN_PROGRESS" &&
          (performer
            ? `Round ${battle.currentTurn!.round}/${battle.rounds} · ${performer.user.displayName} is up`
            : allTurnsDone
              ? "All rounds done — voting next"
              : `Round ${nextRound}/${battle.rounds} · next: ${battle.competitors[nextIndex]?.user.displayName ?? ""}`)}
        {battle.status === "VOTING" && `Vote for the winner${voteLeft !== null ? ` · ${clock(voteLeft)}` : ""}`}
        {finished && (winners[0] ? `Winner: ${winners[0].user.displayName}` : "Battle over")}
      </p>

      {performer && turnLeft !== null && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-amber transition-[width] duration-300" style={{ width: `${(turnLeft / battle.turnSeconds) * 100}%` }} />
          </div>
          <span className={`w-12 text-right font-mono text-[15px] font-bold ${turnLeft <= 10 ? "text-red-soft" : "text-white"}`}>{clock(turnLeft)}</span>
        </div>
      )}

      <div className="mt-2 flex gap-1.5">
        {battle.competitors.map((c) => {
          const up = performer?.id === c.id;
          const voted = battle.myVoteCompetitorId === c.id;
          const canTapVote = battle.status === "VOTING" && battle.canVote && !busy;
          return (
            <button
              key={c.id}
              type="button"
              disabled={finished ? false : !(canTapVote || (onSupport && battle.status !== "READY"))}
              onClick={() => {
                if (finished) return onOpenDetails();
                if (canTapVote) return void run({ action: "vote", competitorId: c.id });
                onSupport?.(c.id);
              }}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border px-1 py-1.5 ${
                up ? "border-amber bg-amber/15" : voted ? "border-red bg-red/20" : "border-white/10 bg-white/[0.06]"
              }`}
            >
              <Avatar person={c.user} className="h-8 w-8" />
              <span className="w-full truncate text-center text-[11px] font-semibold text-white">{c.user.displayName}</span>
              <span className="flex items-center gap-0.5 text-[11px] text-amber">
                <XgCoin className="h-3 w-3" />
                {c.giftsXg.toLocaleString("en-NG")}
              </span>
              {finished && c.place !== null && (
                <span className="text-[10px] font-bold text-white/80">
                  {PLACE[c.place - 1]}
                  {c.prizeXg > 0 ? ` · +${c.prizeXg} XG` : ""}
                </span>
              )}
              {battle.status === "VOTING" && battle.canVote && (
                <span className={`text-[10px] font-bold ${voted ? "text-red-soft" : "text-white/60"}`}>{voted ? "Your vote" : "Vote"}</span>
              )}
            </button>
          );
        })}
      </div>

      {!isHost && onSupport && battle.status === "IN_PROGRESS" && (
        <p className="mt-1.5 text-center text-[11px] text-white/55">Tap a competitor to gift them</p>
      )}

      {isHost && (
        <div className="mt-2 flex gap-1.5">
          {battle.status === "READY" && (
            <HostButton busy={busy} primary onClick={() => run({ action: "start" })}>
              Start battle
            </HostButton>
          )}
          {battle.status === "IN_PROGRESS" && performer && (
            <HostButton busy={busy} onClick={() => run({ action: "end-turn" })}>
              End turn
            </HostButton>
          )}
          {battle.status === "IN_PROGRESS" && !performer && !allTurnsDone && (
            <HostButton busy={busy} primary onClick={() => run({ action: "next-turn" })}>
              Start {battle.competitors[nextIndex]?.user.displayName}&apos;s turn
            </HostButton>
          )}
          {battle.status === "IN_PROGRESS" && !performer && (
            <HostButton busy={busy} primary={allTurnsDone} onClick={() => run({ action: "open-voting" })}>
              Open voting
            </HostButton>
          )}
          {battle.status === "VOTING" && (
            <HostButton busy={busy} primary onClick={() => run({ action: "finish" })}>
              Close vote &amp; show winner
            </HostButton>
          )}
          {!finished && (
            <HostButton busy={busy} onClick={() => run({ action: "cancel" })}>
              Cancel
            </HostButton>
          )}
        </div>
      )}
    </div>
  );
}

function HostButton({ children, onClick, busy, primary }: { children: React.ReactNode; onClick: () => void; busy: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`flex-1 truncate rounded-lg px-2 py-2 text-[12px] font-semibold disabled:opacity-50 ${primary ? "bg-red text-white" : "bg-white/15 text-white"}`}
    >
      {children}
    </button>
  );
}

/** Scoreboard + supporters + recorded turns — used in a sheet during the Live and on the results page. */
export function BattleScoreboard({ battle }: { battle: Battle }) {
  const finished = battle.status === "FINISHED";
  const ordered = finished ? [...battle.competitors].sort((a, b) => (a.place ?? 99) - (b.place ?? 99)) : battle.competitors;
  const nameOf = (id: string) => battle.competitors.find((c) => c.id === id)?.user.displayName ?? "";
  return (
    <div>
      {finished && <p className="mb-3 text-[12px] text-ink-3">Score = 50% share of gifts + 50% share of votes{battle.totalVotes !== null ? ` · ${battle.totalVotes} vote${battle.totalVotes === 1 ? "" : "s"}` : ""}</p>}
      <div className="flex flex-col gap-3">
        {ordered.map((c) => (
          <div key={c.id} className="rounded-2xl border border-line-soft bg-surface p-3">
            <div className="flex items-center gap-3">
              {finished && c.place !== null && <span className="w-8 text-[15px] font-bold text-amber">{PLACE[c.place - 1]}</span>}
              <Avatar person={c.user} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <Link href={`/u/${c.user.handle}`} className="block truncate text-[15px] font-semibold">
                  {c.user.displayName}
                </Link>
                <p className="text-[12px] text-ink-3">
                  {c.giftsXg.toLocaleString("en-NG")} XG gifted
                  {c.votes !== null ? ` · ${c.votes} vote${c.votes === 1 ? "" : "s"}` : ""}
                  {c.score !== null ? ` · score ${c.score}` : ""}
                </p>
              </div>
              {c.prizeXg > 0 && (
                <span className="flex items-center gap-1 text-[13px] font-semibold text-amber">
                  <XgCoin className="h-4 w-4" />+{c.prizeXg.toLocaleString("en-NG")}
                </span>
              )}
            </div>
            {c.supporters.length > 0 && (
              <div className="mt-2.5 border-t border-line-soft pt-2">
                <p className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-3">
                  Supporters ({c.supporterCount})
                </p>
                <div className="flex flex-col gap-1">
                  {c.supporters.map((s) => (
                    <div key={s.person.id} className="flex items-center gap-2 text-[13px]">
                      <Avatar person={s.person} className="h-6 w-6" />
                      <span className="min-w-0 flex-1 truncate">{s.person.displayName}</span>
                      <span className="text-amber">{s.xg.toLocaleString("en-NG")} XG</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {battle.turns.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-[12px] uppercase tracking-wide text-ink-3">Turns</p>
          <div className="flex flex-col gap-1 text-[13px]">
            {battle.turns.map((t) => (
              <div key={t.id} className="flex justify-between gap-2 text-ink-2">
                <span className="truncate">
                  Round {t.round} · {nameOf(t.competitorId)}
                </span>
                <span className="shrink-0 font-mono text-ink-3">
                  {new Date(t.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  {t.seconds !== null ? ` · ${clock(t.seconds)}` : " · live"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function BattleDetailsSheet({ battle, onClose }: { battle: Battle; onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose}>
      <div className="max-h-[70vh] overflow-y-auto">
        <h2 className="mb-1 font-serif text-[24px] leading-tight">{battle.title}</h2>
        <p className="mb-4 text-[13px] text-ink-3">
          {battle.rounds} round{battle.rounds === 1 ? "" : "s"} · {clock(battle.turnSeconds)} per turn
          {battle.prizeXg > 0 ? ` · prize ${battle.prizePlaces.map((x, i) => `${PLACE[i]} ${x} XG`).join(", ")}` : ""}
        </p>
        <BattleScoreboard battle={battle} />
        {battle.status === "FINISHED" && (
          <Link href={`/live/battles/${battle.id}`} className="mt-4 block text-center text-[13px] text-red-soft">
            Open the full result ›
          </Link>
        )}
      </div>
    </BottomSheet>
  );
}

const TURN_OPTIONS = [30, 60, 90, 120, 180, 300];
const VOTE_OPTIONS = [60, 120, 180];

/**
 * Host: set up a battle. Competitors come from everyone in the room —
 * people on stage or just watching (explicit ask, 2026-10-08: "select from
 * viewers straight"); anyone picked who isn't on stage is brought up.
 */
export function BattleSetupSheet({
  people,
  balanceXg,
  act,
  onClose,
}: {
  people: StagePerson[];
  balanceXg: number | null;
  act: (body: Record<string, unknown>) => Promise<Battle | null>;
  onClose: () => void;
}) {
  const toast = useToast();
  const guests = people.filter((p) => p.role !== "host");
  const onStageGuests = guests.filter((g) => g.onStage);
  const watchers = guests.filter((g) => !g.onStage);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>(() => onStageGuests.slice(0, 3).map((g) => g.userId));
  const full = picked.length >= 3;
  const [rounds, setRounds] = useState(2);
  const [turnSeconds, setTurnSeconds] = useState(60);
  const [votingSeconds, setVotingSeconds] = useState(60);
  const [winners, setWinners] = useState(1);
  const [prizes, setPrizes] = useState<number[]>([0, 0, 0]);
  const [busy, setBusy] = useState(false);

  const maxWinners = Math.min(3, Math.max(1, picked.length));
  const places = prizes.slice(0, Math.min(winners, maxWinners));
  const total = places.reduce((a, b) => a + (b || 0), 0);
  const short = balanceXg !== null && total > balanceXg;

  async function create() {
    setBusy(true);
    try {
      await act({ action: "create", title, competitorIds: picked, rounds, turnSeconds, votingSeconds, prizePlaces: places.map((x) => x || 0) });
      toast.success("Battle set — press Start when everyone's ready.");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-[13px] font-semibold ${on ? "border-red bg-red/20 text-white" : "border-line text-ink-2"}`;

  return (
    <BottomSheet onClose={onClose}>
      <div className="max-h-[75vh] overflow-y-auto">
        <h2 className="mb-1 font-serif text-[26px] leading-tight">Start a battle</h2>
        <p className="mb-4 text-[13px] text-ink-3">Competitors take timed turns, viewers gift who they back, then everyone votes. Score is half gifts, half votes.</p>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Title (e.g. Friday rap battle)"
          className="mb-4 w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-red"
        />

        <p className="mb-2 text-[12px] uppercase tracking-wide text-ink-3">Competitors · pick 2–3 ({picked.length} picked)</p>
        {guests.length < 2 ? (
          <p className="mb-4 rounded-lg bg-white/[0.04] p-3 text-[13px] text-ink-2">
            Waiting for people to join — once at least 2 are watching, pick your competitors here. Share your Live to bring them in.
          </p>
        ) : (
          <div className="mb-4 flex flex-col gap-3">
            {[
              { label: "On stage", list: onStageGuests },
              { label: "Watching", list: watchers },
            ]
              .filter((g) => g.list.length > 0)
              .map((group) => (
                <div key={group.label}>
                  <p className="mb-1.5 text-[11px] text-ink-3">{group.label}</p>
                  <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                    {group.list.map((g) => {
                      const on = picked.includes(g.userId);
                      return (
                        <button
                          key={g.userId}
                          type="button"
                          disabled={!on && full}
                          onClick={() => setPicked((p) => (on ? p.filter((x) => x !== g.userId) : [...p, g.userId]))}
                          className={`${chip(on)} disabled:opacity-40`}
                        >
                          {g.displayName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            {picked.some((id) => watchers.some((w) => w.userId === id)) && (
              <p className="text-[11px] text-ink-3">Anyone picked from the viewers is brought on stage when you set up the battle.</p>
            )}
          </div>
        )}

        <p className="mb-2 text-[12px] uppercase tracking-wide text-ink-3">Rounds</p>
        <div className="mb-4 flex gap-2">
          {[1, 2, 3, 4, 5].map((r) => (
            <button key={r} type="button" onClick={() => setRounds(r)} className={chip(rounds === r)}>
              {r}
            </button>
          ))}
        </div>

        <p className="mb-2 text-[12px] uppercase tracking-wide text-ink-3">Time per turn</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {TURN_OPTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setTurnSeconds(s)} className={chip(turnSeconds === s)}>
              {clock(s)}
            </button>
          ))}
        </div>

        <p className="mb-2 text-[12px] uppercase tracking-wide text-ink-3">Voting time</p>
        <div className="mb-4 flex gap-2">
          {VOTE_OPTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setVotingSeconds(s)} className={chip(votingSeconds === s)}>
              {s / 60} min
            </button>
          ))}
        </div>

        <p className="mb-2 text-[12px] uppercase tracking-wide text-ink-3">Prize (XG from your balance)</p>
        <div className="mb-3 flex gap-2">
          {[1, 2, 3].map((w) => (
            <button key={w} type="button" disabled={w > maxWinners} onClick={() => setWinners(w)} className={`${chip(winners === w)} disabled:opacity-40`}>
              {w === 1 ? "1 winner" : `${w} winners`}
            </button>
          ))}
        </div>
        <div className="mb-2 flex flex-col gap-2">
          {places.map((x, i) => (
            <label key={i} className="flex items-center gap-3 text-[14px]">
              <span className="w-10 font-semibold text-amber">{PLACE[i]}</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={x || ""}
                placeholder="0"
                onChange={(e) => {
                  const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                  setPrizes((p) => p.map((old, j) => (j === i ? v : old)));
                }}
                className="w-28 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-red"
              />
              <span className="text-ink-3">XG</span>
            </label>
          ))}
        </div>
        <p className={`mb-5 text-[12px] ${short ? "text-red-soft" : "text-ink-3"}`}>
          {total > 0 ? `${total.toLocaleString("en-NG")} XG is held when you start and paid to the winners; you get back any place nobody fills.` : "No prize — just bragging rights."}
          {balanceXg !== null ? ` You have ${balanceXg.toLocaleString("en-NG")} XG.` : ""}
        </p>

        <button
          type="button"
          onClick={create}
          disabled={busy || picked.length < 2 || short}
          className="w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Setting up…" : "Set up battle"}
        </button>
      </div>
    </BottomSheet>
  );
}
