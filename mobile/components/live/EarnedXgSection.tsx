import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../lib/AuthContext";
import { apiGet } from "../../lib/api";
import type { RootStackParamList } from "../../lib/navigation";
import { colors, fonts } from "../../lib/theme";
import { Avatar } from "../Avatar";
import { XgCoin } from "./LiveIcons";

// Mirrors web's components/live/EarnedXgSection.tsx: the creator's earned XG
// (converted to the wallet on the 1st of each month at the rate in force
// when it was received), per-Live stats, who gifted (top gifter first), and
// the Naira value next to every XG figure, on the XG balance screen.
// Hidden for anyone who has never gone live or received XG.

type Gifter = {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  giftsCount: number;
  xg: number;
  kobo: number;
};

type LiveStats = {
  id: string;
  title: string;
  status: "LIVE" | "ENDED";
  startedAt: string;
  endedAt: string | null;
  peakViewers: number;
  giftsCount: number;
  giftsXg: number;
  giftsKobo: number;
  accessCount: number;
  accessXg: number;
  accessKobo: number;
  requestsCount: number;
  requestsXg: number;
  requestsKobo: number;
  totalXg: number;
  earnedKobo: number;
  gifters: Gifter[];
};

type EarningsData = {
  balanceXg: number;
  balanceKobo: number;
  nextPayoutAt: string;
  rateKobo: number;
  lives: LiveStats[];
  topGifter: Gifter | null;
  conversions: { id: string; amountKobo: number; xg: number; createdAt: string }[];
};

const GIFTERS_COLLAPSED = 3;

// Not lib/format's formatNaira — that one renders 0 as "Free" (a price), and
// a ₦0 balance here should read as ₦0.
function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

function xg(n: number) {
  return `${n.toLocaleString("en-NG")} XG`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
}

function duration(startedAt: string, endedAt: string | null) {
  if (!endedAt) return "Live now";
  const mins = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function Stat({ label, value, naira: nairaValue, sub }: { label: string; value: string; naira?: string; sub?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {nairaValue ? <Text style={styles.statNaira}>{nairaValue}</Text> : null}
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function GifterRow({ gifter, rank, isTop }: { gifter: Gifter; rank: number; isTop: boolean }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <TouchableOpacity
      style={styles.gifterRow}
      disabled={!gifter.handle}
      onPress={() => navigation.navigate("Creator", { handle: gifter.handle })}
    >
      <Text style={styles.rank}>{rank}</Text>
      <Avatar uri={gifter.avatarUrl} name={gifter.displayName} index={rank} size={28} />
      <View style={{ flex: 1 }}>
        <View style={styles.gifterNameRow}>
          <Text style={styles.gifterName} numberOfLines={1}>
            {gifter.displayName}
          </Text>
          {isTop && <Text style={styles.topBadge}>👑 Top gifter</Text>}
        </View>
        <Text style={styles.muted}>
          {gifter.handle ? `@${gifter.handle} · ` : ""}
          {gifter.giftsCount} {gifter.giftsCount === 1 ? "gift" : "gifts"}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.liveXg}>{xg(gifter.xg)}</Text>
        <Text style={styles.liveNaira}>{naira(gifter.kobo)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function LiveCard({ live }: { live: LiveStats }) {
  const [showAll, setShowAll] = useState(false);
  const gifters = showAll ? live.gifters : live.gifters.slice(0, GIFTERS_COLLAPSED);
  return (
    <View style={styles.liveCard}>
      <View style={styles.liveHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.liveTitle} numberOfLines={1}>
            {live.title}
          </Text>
          <Text style={styles.muted}>
            {formatDate(live.startedAt)} · {duration(live.startedAt, live.endedAt)} · {live.peakViewers.toLocaleString("en-NG")} peak viewers
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.liveXg}>{xg(live.totalXg)}</Text>
          <Text style={styles.liveNaira}>{naira(live.earnedKobo)}</Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        <Stat label="Gifts" value={xg(live.giftsXg)} naira={naira(live.giftsKobo)} sub={`${live.giftsCount} sent`} />
        <Stat label="Paid access" value={xg(live.accessXg)} naira={naira(live.accessKobo)} sub={`${live.accessCount} joined`} />
        <Stat label="Requests" value={xg(live.requestsXg)} naira={naira(live.requestsKobo)} sub={`${live.requestsCount} sent`} />
      </View>
      {live.gifters.length > 0 && (
        <View style={styles.giftersBlock}>
          <Text style={styles.statLabel}>WHO GIFTED</Text>
          {gifters.map((g, i) => (
            <GifterRow key={g.userId} gifter={g} rank={i + 1} isTop={i === 0} />
          ))}
          {live.gifters.length > GIFTERS_COLLAPSED && (
            <TouchableOpacity onPress={() => setShowAll((v) => !v)}>
              <Text style={styles.showAll}>{showAll ? "Show less" : `Show all ${live.gifters.length} gifters`}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

export function EarnedXgSection() {
  const { firebaseUser } = useAuth();
  const [data, setData] = useState<EarningsData | null | undefined>(undefined);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser
      .getIdToken()
      .then((idToken) => apiGet<EarningsData>("/api/live/earnings", idToken))
      .then(setData)
      .catch(() => setData(null));
  }, [firebaseUser]);

  if (data === undefined) return <ActivityIndicator color={colors.ink} style={{ marginTop: 32 }} />;
  if (!data || (data.lives.length === 0 && data.balanceXg === 0 && data.conversions.length === 0)) return null;

  const totals = data.lives.reduce((t, l) => ({ xg: t.xg + l.totalXg, kobo: t.kobo + l.earnedKobo }), { xg: 0, kobo: 0 });
  const gifterCount = new Set(data.lives.flatMap((l) => l.gifters.map((g) => g.userId))).size;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>YOUR LIVE EARNINGS</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.cardLabel}>Earned XG</Text>
          <View style={styles.balanceRow}>
            <XgCoin size={24} />
            <Text style={styles.balance}>{xg(data.balanceXg)}</Text>
          </View>
        </View>
        <View style={[styles.row, { marginTop: 4 }]}>
          <Text style={styles.muted}>Worth</Text>
          <Text style={styles.worth}>{naira(data.balanceKobo)}</Text>
        </View>
      </View>
      <Text style={styles.note}>
        Paid into your wallet on {formatDate(data.nextPayoutAt)}, then withdrawable as usual. You earn {naira(data.rateKobo)} per XG
        received.
      </Text>

      {data.lives.length > 0 && (
        <>
          <View style={styles.statsRow}>
            <Stat label="Lives" value={data.lives.length.toLocaleString("en-NG")} />
            <Stat label="XG received" value={totals.xg.toLocaleString("en-NG")} naira={naira(totals.kobo)} />
            <Stat label="Gifters" value={gifterCount.toLocaleString("en-NG")} />
          </View>

          {data.topGifter && (
            <View style={styles.topGifterCard}>
              <Text style={[styles.statLabel, { color: colors.amber, marginTop: 10 }]}>YOUR TOP GIFTER</Text>
              <GifterRow gifter={data.topGifter} rank={1} isTop={false} />
            </View>
          )}

          {data.lives.map((l) => (
            <LiveCard key={l.id} live={l} />
          ))}
        </>
      )}

      {data.conversions.length > 0 && (
        <>
          <Text style={[styles.heading, { marginTop: 20 }]}>MONTHLY PAYOUTS TO WALLET</Text>
          {data.conversions.map((c) => (
            <View key={c.id} style={styles.conversionRow}>
              <Text style={styles.conversionText}>
                {formatDate(c.createdAt)} <Text style={styles.muted}>· {xg(c.xg)}</Text>
              </Text>
              <Text style={styles.worth}>{naira(c.amountKobo)}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 36 },
  heading: { color: colors.ink3, fontSize: 12, letterSpacing: 1.2, marginBottom: 12 },
  card: {
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 8,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardLabel: { color: colors.ink2, fontSize: 14 },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  balance: { color: colors.amber, fontSize: 20, fontWeight: "700" },
  worth: { color: colors.ink, fontSize: 17, fontFamily: fonts.serif },
  muted: { color: colors.ink3, fontSize: 12 },
  note: { color: colors.ink3, fontSize: 12, marginBottom: 20 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  stat: { flex: 1, backgroundColor: colors.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  statLabel: { color: colors.ink3, fontSize: 10, letterSpacing: 1 },
  statValue: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  statNaira: { color: colors.ink2, fontSize: 12 },
  statSub: { color: colors.ink3, fontSize: 11 },
  liveCard: {
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    paddingBottom: 0,
    marginBottom: 12,
  },
  liveHeader: { flexDirection: "row", gap: 12, marginBottom: 8 },
  liveTitle: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  liveXg: { color: colors.amber, fontSize: 14, fontWeight: "600" },
  liveNaira: { color: colors.ink2, fontSize: 12 },
  giftersBlock: { borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: 8, marginBottom: 10 },
  gifterRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  rank: { width: 16, textAlign: "center", color: colors.ink3, fontSize: 12 },
  gifterNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  gifterName: { color: colors.ink, fontSize: 13, fontWeight: "600", flexShrink: 1 },
  topBadge: {
    color: colors.amber,
    fontSize: 10,
    fontWeight: "600",
    backgroundColor: "rgba(217,154,43,0.15)",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden",
  },
  showAll: { color: colors.ink2, fontSize: 12, fontWeight: "600", paddingVertical: 4 },
  topGifterCard: {
    borderWidth: 1,
    borderColor: "rgba(217,154,43,0.3)",
    backgroundColor: "rgba(217,154,43,0.05)",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  conversionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  conversionText: { color: colors.ink, fontSize: 14 },
});
