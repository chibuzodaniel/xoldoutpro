import { useCallback, useEffect, useState } from "react";
import { Modal, Text, TouchableOpacity, Vibration, View, StyleSheet, Animated, Easing } from "react-native";
import { useAuth } from "../../lib/AuthContext";
import { API_BASE_URL } from "../../lib/api";
import { onBattleInvite } from "../../lib/battleInviteBus";
import { navigationRef } from "../../lib/messageNotify";
import { colors, fonts } from "../../lib/theme";
import { useToast } from "../ToastProvider";
import { InitialsAvatar } from "./LiveBits";
import { XgCoin } from "./LiveIcons";

// A battle invite ringing (explicit ask, 2026-10-08) — mirrors web's
// components/live/BattleInviteRing.tsx: the host, everyone invited, the
// battle's settings, and Accept / Decline like an incoming call. Vibrates
// while it rings (the push itself carries the sound).

type Person = { id: string; handle: string; displayName: string; avatarUrl: string | null };
type Invite = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  expiresAt: string;
  liveSessionId: string;
  host: Person;
  battle: { id: string; title: string; status: string; rounds: number; turnSeconds: number; votingSeconds: number; prizePlaces: number[]; prizeXg: number };
  people: Person[];
};

const handled = new Set<string>();
const PLACE = ["1st", "2nd", "3rd"];
function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function isLive(i: Invite) {
  return i.status === "PENDING" && i.battle.status === "READY" && new Date(i.expiresAt).getTime() > Date.now();
}

export function BattleInviteRing() {
  const { firebaseUser } = useAuth();
  const toast = useToast();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(
    () =>
      onBattleInvite(async ({ inviteId, invite: given }) => {
        if (handled.has(inviteId)) return;
        let next = given as Invite | undefined;
        if (!next && firebaseUser) {
          try {
            const res = await fetch(`${API_BASE_URL}/api/live/battle-invites/${inviteId}`, {
              headers: { Authorization: `Bearer ${await firebaseUser.getIdToken()}` },
            });
            if (res.ok) next = (await res.json()).invite;
          } catch {
            // offline — the poll will bring it again
          }
        }
        if (!next) return;
        if (isLive(next)) setInvite((cur) => cur ?? next!);
        else if (!given) toast.error("That battle invite is no longer active.");
      }),
    [firebaseUser, toast],
  );

  const close = useCallback(() => {
    setInvite((cur) => {
      if (cur) handled.add(cur.id);
      return null;
    });
  }, []);

  // Ring (vibrate + pulse) until answered or the invite lapses.
  const inviteId = invite?.id;
  const expiresAt = invite?.expiresAt;
  useEffect(() => {
    if (!inviteId || !expiresAt) return;
    Vibration.vibrate([0, 800, 1200], true);
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    const lapse = setTimeout(close, Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    return () => {
      Vibration.cancel();
      loop.stop();
      pulse.setValue(0);
      clearTimeout(lapse);
    };
  }, [inviteId, expiresAt, close, pulse]);

  async function answer(accept: boolean) {
    if (!invite || !firebaseUser) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/live/battle-invites/${invite.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await firebaseUser.getIdToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong");
      const liveId = invite.liveSessionId;
      close();
      if (accept) {
        toast.success("You're in! Your followers are being told to come and support you.");
        if (navigationRef.isReady()) navigationRef.navigate("LiveViewer", { id: liveId });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      close();
    } finally {
      setBusy(false);
    }
  }

  if (!invite) return null;
  const b = invite.battle;
  const prize = b.prizeXg > 0 ? b.prizePlaces.map((x, i) => `${PLACE[i]} ${x.toLocaleString("en-NG")} XG`).join(" · ") : "No prize — keep every gift you get";
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={() => answer(false)}>
      <View style={styles.screen}>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.kicker}>⚔️ BATTLE INVITE</Text>
          <View style={styles.avatarWrap}>
            <Animated.View style={[styles.pulse, { transform: [{ scale }], opacity }]} />
            <View style={styles.avatarRing}>
              <InitialsAvatar name={invite.host.displayName} avatarUrl={invite.host.avatarUrl} size={104} />
            </View>
          </View>
          <Text style={styles.lead}>
            <Text style={{ fontWeight: "800" }}>{invite.host.displayName}</Text> is inviting you to a battle
          </Text>
          <Text style={styles.title}>{b.title}</Text>
          <View style={styles.people}>
            {invite.people.map((p) => (
              <View key={p.id} style={styles.personChip}>
                <Text style={styles.personText}>@{p.handle}</Text>
              </View>
            ))}
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{b.rounds}</Text>
              <Text style={styles.statLabel}>round{b.rounds === 1 ? "" : "s"}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{clock(b.turnSeconds)}</Text>
              <Text style={styles.statLabel}>per turn</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{clock(b.votingSeconds)}</Text>
              <Text style={styles.statLabel}>voting</Text>
            </View>
          </View>
          <View style={styles.prizeRow}>
            <XgCoin size={16} />
            <Text style={styles.prize}>{prize}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.action} disabled={busy} onPress={() => answer(false)} accessibilityLabel="Decline the battle invite">
            <View style={[styles.circle, { backgroundColor: colors.red }]}>
              <Text style={styles.circleText}>✕</Text>
            </View>
            <Text style={styles.actionLabel}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.action} disabled={busy} onPress={() => answer(true)} accessibilityLabel="Accept the battle invite">
            <View style={[styles.circle, { backgroundColor: colors.green }]}>
              <Text style={styles.circleText}>⚔️</Text>
            </View>
            <Text style={styles.actionLabel}>Accept</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#1a0a2b", justifyContent: "space-between", paddingTop: 80, paddingBottom: 60, paddingHorizontal: 24 },
  kicker: { color: colors.amber, fontSize: 13, fontWeight: "800", letterSpacing: 3 },
  avatarWrap: { marginTop: 32, width: 120, height: 120, alignItems: "center", justifyContent: "center" },
  pulse: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: colors.amber },
  avatarRing: { borderWidth: 4, borderColor: colors.amber, borderRadius: 60, padding: 2 },
  lead: { marginTop: 24, color: "#fff", fontSize: 17, textAlign: "center" },
  title: { marginTop: 8, color: "#fff", fontSize: 30, fontFamily: fonts.serif, textAlign: "center" },
  people: { marginTop: 18, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  personChip: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  personText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  stats: { marginTop: 22, flexDirection: "row", gap: 8, alignSelf: "stretch" },
  stat: { flex: 1, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  statValue: { color: "#fff", fontSize: 18, fontWeight: "800" },
  statLabel: { color: "rgba(255,255,255,0.9)", fontSize: 11, marginTop: 2 },
  prizeRow: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 6 },
  prize: { color: colors.amber, fontSize: 14, fontWeight: "700" },
  actions: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 30 },
  action: { alignItems: "center", gap: 8 },
  circle: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  circleText: { color: "#fff", fontSize: 26 },
  actionLabel: { color: "#fff", fontSize: 13 },
});
