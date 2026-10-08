import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useAuth } from "../../lib/AuthContext";
import { API_BASE_URL } from "../../lib/api";
import { colors, fonts } from "../../lib/theme";
import { useToast } from "../ToastProvider";
import { BottomSheet, InitialsAvatar } from "./LiveBits";
import { XgCoin } from "./LiveIcons";
import type { StagePerson } from "./Stage";

// Live battles (rap battles etc. — explicit ask, 2026-10-08) for mobile —
// mirrors web's components/live/battle.tsx; rules in web's lib/live/battle.ts.
// Read once when the Live opens and again only when the room announces a
// "battle" live-event — no polling (Vercel CPU budget, see CLAUDE.md).

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
  // Mutual followers invited while the battle is being set up.
  invites: { id: string; user: BattlePerson; status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" }[];
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

export function useBattle(liveId: string) {
  const { firebaseUser } = useAuth();
  const [battle, setBattle] = useState<Battle | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [skewMs, setSkewMs] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const idToken = firebaseUser ? await firebaseUser.getIdToken() : undefined;
      const res = await fetch(`${API_BASE_URL}/api/live/${liveId}/battle`, {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
      });
      if (!res.ok) return;
      const data: { battle: Battle | null } = await res.json();
      setBattle(data.battle);
      setLoaded(true);
      if (data.battle) setSkewMs(new Date(data.battle.serverTime).getTime() - Date.now());
    } catch {
      // keep the last good state
    }
  }, [firebaseUser, liveId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // apiPost drops the response body, so this reads it for the server's reason.
  const act = useCallback(
    async (body: Record<string, unknown>) => {
      if (!firebaseUser) throw new Error("Sign in first");
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/live/${liveId}/battle`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong");
      setBattle(data.battle ?? null);
      return data.battle as Battle | null;
    },
    [firebaseUser, liveId],
  );

  const bumpGift = useCallback((competitorId: string, xg: number) => {
    setBattle((b) => (b ? { ...b, competitors: b.competitors.map((c) => (c.id === competitorId ? { ...c, giftsXg: c.giftsXg + xg } : c)) } : b));
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

const PLACE = ["1st", "2nd", "3rd", "4th"];

export function BattleBar({
  battle,
  skewMs,
  isHost,
  act,
  onSupport,
  onOpenDetails,
  onDismiss,
}: {
  battle: Battle;
  skewMs: number;
  isHost: boolean;
  act: (body: Record<string, unknown>) => Promise<Battle | null>;
  onSupport?: (competitorId: string) => void;
  onOpenDetails: () => void;
  onDismiss?: () => void;
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

  // The host's phone closes a turn / the vote when its time runs out.
  const autoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isHost) return;
    if (battle.currentTurn && turnLeft === 0 && autoRef.current !== battle.currentTurn.id) {
      autoRef.current = battle.currentTurn.id;
      run({ action: "end-turn" });
    }
    if (battle.status === "VOTING" && voteLeft === 0 && autoRef.current !== `vote-${battle.id}`) {
      autoRef.current = `vote-${battle.id}`;
      run({ action: "finish" });
    }
  }, [isHost, battle, turnLeft, voteLeft, run]);

  const performer = battle.currentTurn ? battle.competitors.find((c) => c.id === battle.currentTurn!.competitorId) : null;
  const n = battle.competitors.length || 1;
  const nextIndex = battle.turnsDone % n;
  const nextRound = Math.floor(battle.turnsDone / n) + 1;
  const allTurnsDone = battle.turnsDone >= battle.turnsTotal;
  const finished = battle.status === "FINISHED";
  const winner = finished ? battle.competitors.find((c) => c.place === 1) : null;

  let line = "";
  if (battle.status === "READY") line = "Getting ready…";
  else if (battle.status === "IN_PROGRESS")
    line = performer
      ? `Round ${battle.currentTurn!.round}/${battle.rounds} · ${performer.user.displayName} is up`
      : allTurnsDone
        ? "All rounds done — voting next"
        : `Round ${nextRound}/${battle.rounds} · next: ${battle.competitors[nextIndex]?.user.displayName ?? ""}`;
  else if (battle.status === "VOTING") line = `Vote for the winner${voteLeft !== null ? ` · ${clock(voteLeft)}` : ""}`;
  else if (finished) line = winner ? `Winner: ${winner.user.displayName}` : "Battle over";

  return (
    <View style={styles.bar}>
      <View style={styles.barHeader}>
        <TouchableOpacity style={styles.barTitleRow} onPress={onOpenDetails}>
          <View style={styles.battleTag}>
            <Text style={styles.battleTagText}>BATTLE</Text>
          </View>
          <Text style={styles.barTitle} numberOfLines={1}>
            {battle.title}
          </Text>
          {battle.prizeXg > 0 && (
            <View style={styles.prizeRow}>
              <XgCoin size={14} />
              <Text style={styles.prizeText}>{battle.prizeXg.toLocaleString("en-NG")} prize</Text>
            </View>
          )}
        </TouchableOpacity>
        {finished && onDismiss && (
          <TouchableOpacity onPress={onDismiss} hitSlop={10} accessibilityLabel="Hide the battle result">
            <Text style={styles.dismiss}>×</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.barLine}>{line}</Text>

      {battle.status === "READY" && battle.invites.length > 0 && (
        <View style={styles.inviteRow}>
          {battle.invites.map((i) => (
            <View key={i.id} style={[styles.inviteChip, i.status === "PENDING" && styles.inviteChipRinging]}>
              <Text style={[styles.inviteChipText, i.status === "PENDING" && { color: colors.amber }]}>
                {i.status === "PENDING" ? "📞 Ringing" : i.status === "DECLINED" ? "Declined" : "No answer"} · @{i.user.handle}
              </Text>
            </View>
          ))}
        </View>
      )}

      {performer && turnLeft !== null && (
        <View style={styles.timerRow}>
          <View style={styles.timerTrack}>
            <View style={[styles.timerFill, { width: `${(turnLeft / battle.turnSeconds) * 100}%` }]} />
          </View>
          <Text style={[styles.timerText, turnLeft <= 10 && { color: colors.redSoft }]}>{clock(turnLeft)}</Text>
        </View>
      )}

      <View style={styles.competitorRow}>
        {battle.competitors.map((c) => {
          const up = performer?.id === c.id;
          const voted = battle.myVoteCompetitorId === c.id;
          const canTapVote = battle.status === "VOTING" && battle.canVote && !busy;
          return (
            <TouchableOpacity
              key={c.id}
              style={[styles.competitor, up && styles.competitorUp, voted && styles.competitorVoted]}
              disabled={finished ? false : !(canTapVote || (onSupport && battle.status !== "READY"))}
              onPress={() => {
                if (finished) return onOpenDetails();
                if (canTapVote) return void run({ action: "vote", competitorId: c.id });
                onSupport?.(c.id);
              }}
            >
              <InitialsAvatar name={c.user.displayName} avatarUrl={c.user.avatarUrl} size={32} />
              <Text style={styles.competitorName} numberOfLines={1}>
                {c.user.displayName}
              </Text>
              <View style={styles.prizeRow}>
                <XgCoin size={12} />
                <Text style={styles.competitorXg}>{c.giftsXg.toLocaleString("en-NG")}</Text>
              </View>
              {finished && c.place !== null && (
                <Text style={styles.competitorPlace}>
                  {PLACE[c.place - 1]}
                  {c.prizeXg > 0 ? ` · +${c.prizeXg} XG` : ""}
                </Text>
              )}
              {battle.status === "VOTING" && battle.canVote && (
                <Text style={[styles.competitorPlace, voted && { color: colors.redSoft }]}>{voted ? "Your vote" : "Vote"}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {!isHost && onSupport && battle.status === "IN_PROGRESS" && <Text style={styles.hint}>Tap a competitor to gift them</Text>}

      {isHost && (
        <View style={styles.hostRow}>
          {battle.status === "READY" && (
            <HostButton
              busy={busy || battle.competitors.length < 2}
              primary
              label={battle.competitors.length < 2 ? "Waiting for 2 competitors…" : "Start battle"}
              onPress={() => run({ action: "start" })}
            />
          )}
          {battle.status === "IN_PROGRESS" && performer && <HostButton busy={busy} label="End turn" onPress={() => run({ action: "end-turn" })} />}
          {battle.status === "IN_PROGRESS" && !performer && !allTurnsDone && (
            <HostButton
              busy={busy}
              primary
              label={`Start ${battle.competitors[nextIndex]?.user.displayName ?? ""}'s turn`}
              onPress={() => run({ action: "next-turn" })}
            />
          )}
          {battle.status === "IN_PROGRESS" && !performer && (
            <HostButton busy={busy} primary={allTurnsDone} label="Open voting" onPress={() => run({ action: "open-voting" })} />
          )}
          {battle.status === "VOTING" && <HostButton busy={busy} primary label="Close vote & show winner" onPress={() => run({ action: "finish" })} />}
          {!finished && <HostButton busy={busy} label="Cancel" onPress={() => run({ action: "cancel" })} />}
        </View>
      )}
    </View>
  );
}

function HostButton({ label, onPress, busy, primary }: { label: string; onPress: () => void; busy: boolean; primary?: boolean }) {
  return (
    <TouchableOpacity disabled={busy} onPress={onPress} style={[styles.hostButton, primary && styles.hostButtonPrimary, busy && { opacity: 0.5 }]}>
      <Text style={styles.hostButtonText} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function BattleDetailsSheet({ battle, visible, onClose }: { battle: Battle | null; visible: boolean; onClose: () => void }) {
  const finished = battle?.status === "FINISHED";
  const ordered = !battle ? [] : finished ? [...battle.competitors].sort((a, b) => (a.place ?? 99) - (b.place ?? 99)) : battle.competitors;
  const nameOf = (id: string) => battle?.competitors.find((c) => c.id === id)?.user.displayName ?? "";
  return (
    <BottomSheet visible={visible && !!battle} onClose={onClose}>
      {battle && (
        <ScrollView style={{ maxHeight: 520 }}>
          <Text style={styles.sheetTitle}>{battle.title}</Text>
          <Text style={styles.sheetSub}>
            {battle.rounds} round{battle.rounds === 1 ? "" : "s"} · {clock(battle.turnSeconds)} per turn
            {battle.prizeXg > 0 ? ` · prize ${battle.prizePlaces.map((x, i) => `${PLACE[i]} ${x} XG`).join(", ")}` : ""}
          </Text>
          {finished && (
            <Text style={styles.sheetSub}>
              Score = 50% share of gifts + 50% share of votes
              {battle.totalVotes !== null ? ` · ${battle.totalVotes} vote${battle.totalVotes === 1 ? "" : "s"}` : ""}
            </Text>
          )}
          {ordered.map((c) => (
            <View key={c.id} style={styles.scoreCard}>
              <View style={styles.scoreRow}>
                {finished && c.place !== null && <Text style={styles.scorePlace}>{PLACE[c.place - 1]}</Text>}
                <InitialsAvatar name={c.user.displayName} avatarUrl={c.user.avatarUrl} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.scoreName} numberOfLines={1}>
                    {c.user.displayName}
                  </Text>
                  <Text style={styles.scoreMeta}>
                    {c.giftsXg.toLocaleString("en-NG")} XG gifted
                    {c.votes !== null ? ` · ${c.votes} vote${c.votes === 1 ? "" : "s"}` : ""}
                    {c.score !== null ? ` · score ${c.score}` : ""}
                  </Text>
                </View>
                {c.prizeXg > 0 && <Text style={styles.scorePrize}>+{c.prizeXg.toLocaleString("en-NG")} XG</Text>}
              </View>
              {c.supporters.length > 0 && (
                <View style={styles.supporters}>
                  <Text style={styles.label}>Supporters ({c.supporterCount})</Text>
                  {c.supporters.map((s) => (
                    <View key={s.person.id} style={styles.supporterRow}>
                      <InitialsAvatar name={s.person.displayName} avatarUrl={s.person.avatarUrl} size={22} />
                      <Text style={styles.supporterName} numberOfLines={1}>
                        {s.person.displayName}
                      </Text>
                      <Text style={styles.supporterXg}>{s.xg.toLocaleString("en-NG")} XG</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
          {battle.turns.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.label}>Turns</Text>
              {battle.turns.map((t) => (
                <View key={t.id} style={styles.turnRow}>
                  <Text style={styles.turnText} numberOfLines={1}>
                    Round {t.round} · {nameOf(t.competitorId)}
                  </Text>
                  <Text style={styles.turnTime}>
                    {new Date(t.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    {t.seconds !== null ? ` · ${clock(t.seconds)}` : " · live"}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const TURN_OPTIONS = [30, 60, 90, 120, 180, 300];
const VOTE_OPTIONS = [60, 120, 180];

/** Host: competitors come from everyone in the room — on stage or just watching (picked viewers are brought on stage). */
export function BattleSetupSheet({
  liveId,
  visible,
  people,
  balanceXg,
  act,
  onClose,
}: {
  visible: boolean;
  liveId: string;
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
  const [picked, setPicked] = useState<string[] | null>(null);
  const [rounds, setRounds] = useState(2);
  const [turnSeconds, setTurnSeconds] = useState(60);
  const [votingSeconds, setVotingSeconds] = useState(60);
  // The prize is optional (explicit ask, 2026-10-08): off by default.
  const [withPrize, setWithPrize] = useState(false);
  const [winners, setWinners] = useState(1);
  const [prizes, setPrizes] = useState<number[]>([0, 0, 0]);
  const [busy, setBusy] = useState(false);

  // Everyone on stage (up to 3) is picked until the host changes it.
  const chosen = picked ?? onStageGuests.slice(0, 3).map((g) => g.userId);
  // Mutual followers to ring (explicit ask, 2026-10-08) — they join when they accept.
  const { firebaseUser } = useAuth();
  const [invitable, setInvitable] = useState<BattlePerson[] | null>(null);
  const [invited, setInvited] = useState<string[]>([]);
  useEffect(() => {
    if (!visible || !firebaseUser) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/live/${liveId}/battle/invitable`, {
          headers: { Authorization: `Bearer ${await firebaseUser.getIdToken()}` },
        });
        const data = res.ok ? await res.json() : { people: [] };
        if (!cancelled) setInvitable(data.people ?? []);
      } catch {
        if (!cancelled) setInvitable([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, firebaseUser, liveId]);
  const inRoom = new Set(guests.map((g) => g.userId));
  const count = chosen.length + invited.length;
  const full = count >= 3;
  const maxWinners = Math.min(3, Math.max(1, chosen.length));
  const places = withPrize ? prizes.slice(0, Math.min(winners, maxWinners)) : [];
  const total = places.reduce((a, b) => a + (b || 0), 0);
  const short = balanceXg !== null && total > balanceXg;

  async function create() {
    setBusy(true);
    try {
      await act({ action: "create", title, competitorIds: chosen, inviteIds: invited, rounds, turnSeconds, votingSeconds, prizePlaces: places });
      toast.success("Battle set — press Start when everyone's ready.");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const Chip = ({ on, label, onPress, disabled }: { on: boolean; label: string; onPress: () => void; disabled?: boolean }) => (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={[styles.chip, on && styles.chipOn, disabled && { opacity: 0.4 }]}>
      <Text style={[styles.chipText, on && { color: "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView style={{ maxHeight: 560 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.sheetTitle}>Start a battle</Text>
        <Text style={styles.sheetSub}>Competitors take timed turns, viewers gift who they back, then everyone votes. Score is half gifts, half votes.</Text>

        <TextInput
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          placeholder="Title (e.g. Friday rap battle)"
          placeholderTextColor={colors.ink3}
          style={styles.input}
        />

        <Text style={styles.label}>Competitors · pick or invite 2–3 ({count} chosen)</Text>
        {guests.length === 0 ? (
          <Text style={styles.note}>No one's watching yet — invite people below, or share your Live to bring them in.</Text>
        ) : (
          [
            { label: "On stage", list: onStageGuests },
            { label: "Watching", list: watchers },
          ]
            .filter((g) => g.list.length > 0)
            .map((group) => (
              <View key={group.label}>
                <Text style={styles.note}>{group.label}</Text>
                <View style={styles.chips}>
                  {group.list.map((g) => {
                    const on = chosen.includes(g.userId);
                    return (
                      <Chip
                        key={g.userId}
                        on={on}
                        disabled={!on && full}
                        label={g.displayName}
                        onPress={() => setPicked(on ? chosen.filter((x) => x !== g.userId) : [...chosen, g.userId])}
                      />
                    );
                  })}
                </View>
              </View>
            ))
        )}
        {chosen.some((id) => watchers.some((w) => w.userId === id)) && (
          <Text style={styles.note}>Anyone picked from the viewers is brought on stage when you set up the battle.</Text>
        )}

        <Text style={styles.note}>Invite mutual followers — their phone rings with the battle details</Text>
        {invitable === null ? (
          <Text style={styles.note}>Loading…</Text>
        ) : invitable.filter((p) => !inRoom.has(p.id)).length === 0 ? (
          <Text style={styles.note}>No mutual followers to invite yet — people you follow who follow you back show here.</Text>
        ) : (
          <View style={styles.chips}>
            {invitable
              .filter((p) => !inRoom.has(p.id))
              .map((p) => {
                const on = invited.includes(p.id);
                return (
                  <Chip
                    key={p.id}
                    on={on}
                    disabled={!on && full}
                    label={`${on ? "📞 " : ""}${p.displayName}`}
                    onPress={() => setInvited((cur) => (on ? cur.filter((x) => x !== p.id) : [...cur, p.id]))}
                  />
                );
              })}
          </View>
        )}

        <Text style={styles.label}>Rounds</Text>
        <View style={styles.chips}>
          {[1, 2, 3, 4, 5].map((r) => (
            <Chip key={r} on={rounds === r} label={String(r)} onPress={() => setRounds(r)} />
          ))}
        </View>

        <Text style={styles.label}>Time per turn</Text>
        <View style={styles.chips}>
          {TURN_OPTIONS.map((s) => (
            <Chip key={s} on={turnSeconds === s} label={clock(s)} onPress={() => setTurnSeconds(s)} />
          ))}
        </View>

        <Text style={styles.label}>Voting time</Text>
        <View style={styles.chips}>
          {VOTE_OPTIONS.map((s) => (
            <Chip key={s} on={votingSeconds === s} label={`${s / 60} min`} onPress={() => setVotingSeconds(s)} />
          ))}
        </View>

        <TouchableOpacity style={styles.prizeToggle} onPress={() => setWithPrize((v) => !v)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.prizeToggleTitle}>Add an XG prize</Text>
            <Text style={styles.note}>Optional — paid from your own XG balance</Text>
          </View>
          <View style={[styles.switchTrack, withPrize && styles.switchTrackOn]}>
            <View style={styles.switchThumb} />
          </View>
        </TouchableOpacity>
        {withPrize && (
          <View style={styles.chips}>
            {[1, 2, 3].map((w) => (
              <Chip key={w} on={winners === w} disabled={w > maxWinners} label={w === 1 ? "1 winner" : `${w} winners`} onPress={() => setWinners(w)} />
            ))}
          </View>
        )}
        {places.map((x, i) => (
          <View key={i} style={styles.prizeInputRow}>
            <Text style={styles.prizePlace}>{PLACE[i]}</Text>
            <TextInput
              keyboardType="number-pad"
              value={x ? String(x) : ""}
              placeholder="0"
              placeholderTextColor={colors.ink3}
              onChangeText={(t) => {
                const v = Math.max(0, Math.floor(Number(t.replace(/\D/g, "")) || 0));
                setPrizes((p) => p.map((old, j) => (j === i ? v : old)));
              }}
              style={[styles.input, { width: 110, marginBottom: 0 }]}
            />
            <Text style={styles.note}>XG</Text>
          </View>
        ))}
        <Text style={[styles.note, short && { color: colors.redSoft }]}>
          {total > 0
            ? `${total.toLocaleString("en-NG")} XG is held when you start and paid to the winners; you get back any place nobody fills.`
            : "No prize — competitors keep every gift they're sent, and the winner gets the bragging rights."}
          {balanceXg !== null ? ` You have ${balanceXg.toLocaleString("en-NG")} XG.` : ""}
        </Text>

        <TouchableOpacity
          onPress={create}
          disabled={busy || count < 2 || short}
          style={[styles.createButton, (busy || count < 2 || short) && { opacity: 0.5 }]}
        >
          <Text style={styles.createButtonText}>{busy ? "Setting up…" : invited.length > 0 ? `Set up & ring ${invited.length}` : "Set up battle"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  bar: { marginTop: 8, borderRadius: 16, borderWidth: 1, borderColor: "rgba(217,154,43,0.3)", backgroundColor: "rgba(0,0,0,0.6)", padding: 10 },
  barHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  barTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  battleTag: { backgroundColor: colors.amber, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  battleTagText: { color: "#000", fontSize: 10, fontWeight: "800" },
  barTitle: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "700" },
  prizeRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  prizeText: { color: colors.amber, fontSize: 12, fontWeight: "700" },
  dismiss: { color: "rgba(255,255,255,0.9)", fontSize: 18 },
  barLine: { marginTop: 4, color: "rgba(255,255,255,0.9)", fontSize: 12 },
  timerRow: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8 },
  timerTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden" },
  timerFill: { height: "100%", borderRadius: 3, backgroundColor: colors.amber },
  timerText: { width: 48, textAlign: "right", color: "#fff", fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
  competitorRow: { marginTop: 8, flexDirection: "row", gap: 6 },
  competitor: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  competitorUp: { borderColor: colors.amber, backgroundColor: "rgba(217,154,43,0.15)" },
  competitorVoted: { borderColor: colors.red, backgroundColor: "rgba(225,29,46,0.2)" },
  competitorName: { color: "#fff", fontSize: 11, fontWeight: "700", maxWidth: "100%" },
  competitorXg: { color: colors.amber, fontSize: 11 },
  competitorPlace: { color: "rgba(255,255,255,0.8)", fontSize: 10, fontWeight: "800" },
  hint: { marginTop: 6, textAlign: "center", color: "rgba(255,255,255,0.9)", fontSize: 11 },
  hostRow: { marginTop: 8, flexDirection: "row", gap: 6 },
  hostButton: { flex: 1, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.15)", paddingVertical: 8, paddingHorizontal: 6, alignItems: "center" },
  hostButtonPrimary: { backgroundColor: colors.red },
  hostButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  sheetTitle: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, marginBottom: 4 },
  sheetSub: { fontSize: 13, color: colors.ink3, marginBottom: 12 },
  label: { fontSize: 12, color: colors.ink3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  note: { fontSize: 12, color: colors.ink3, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
    marginBottom: 14,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: colors.red, backgroundColor: "rgba(225,29,46,0.2)" },
  chipText: { color: colors.ink2, fontSize: 13, fontWeight: "700" },
  inviteRow: { marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  inviteChip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: "rgba(255,255,255,0.1)" },
  inviteChipRinging: { backgroundColor: "rgba(217,154,43,0.2)" },
  inviteChipText: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "700" },
  prizeToggle: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 12, paddingTop: 10, marginBottom: 12 },
  prizeToggleTitle: { color: colors.ink, fontSize: 14, fontWeight: "700", marginBottom: 2 },
  switchTrack: { width: 44, height: 24, borderRadius: 12, backgroundColor: colors.surface2, padding: 2, justifyContent: "center", marginBottom: 10 },
  switchTrackOn: { backgroundColor: colors.red, alignItems: "flex-end" },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },
  prizeInputRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  prizePlace: { width: 40, color: colors.amber, fontWeight: "700", fontSize: 14 },
  createButton: { backgroundColor: colors.red, borderRadius: 8, paddingVertical: 13, alignItems: "center", marginTop: 4, marginBottom: 8 },
  createButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  scoreCard: { borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, borderRadius: 16, padding: 12, marginBottom: 10 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  scorePlace: { width: 32, color: colors.amber, fontWeight: "800", fontSize: 15 },
  scoreName: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  scoreMeta: { color: colors.ink3, fontSize: 12 },
  scorePrize: { color: colors.amber, fontWeight: "700", fontSize: 13 },
  supporters: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: 8 },
  supporterRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  supporterName: { flex: 1, color: colors.ink, fontSize: 13 },
  supporterXg: { color: colors.amber, fontSize: 13 },
  turnRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 4 },
  turnText: { flex: 1, color: colors.ink2, fontSize: 13 },
  turnTime: { color: colors.ink3, fontSize: 13, fontVariant: ["tabular-nums"] },
});
