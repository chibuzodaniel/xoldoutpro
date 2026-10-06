import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, FlatList, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../lib/AuthContext";
import { apiGet } from "../../lib/api";
import type { RootStackParamList } from "../../lib/navigation";
import type { LiveSessionSummary, UpcomingLiveSummary } from "../../lib/liveTypes";
import { colors } from "../../lib/theme";
import { InitialsAvatar, LiveCard } from "./LiveBits";
import { BroadcastIcon, ShieldIcon, XgCoin } from "./LiveIcons";

// The "Live now" list + Go Live entry point + lifetime gift earnings —
// shared by screens/LiveNowScreen.tsx (reached from Discover) and Socials'
// own "Go Live" tab (SocialsScreen.tsx), so the two entry points the
// mockups show (Discover's nav row, and Socials' Feed/Go Live/Fanbase tabs)
// render the exact same content instead of two screens that could drift.
export function LiveNowPanel() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();
  const [sessions, setSessions] = useState<LiveSessionSummary[] | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingLiveSummary[]>([]);
  // Upcoming is collapsed by default and searchable once opened (explicit
  // ask, 2026-10-04) — mirrors web's UpcomingSection.
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const [upcomingQuery, setUpcomingQuery] = useState("");
  const q = upcomingQuery.trim().toLowerCase();
  const upcomingMatches = q
    ? upcoming.filter((u) => u.title.toLowerCase().includes(q) || u.creator.displayName.toLowerCase().includes(q))
    : upcoming;
  const [earningsXg, setEarningsXg] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      // `upcoming` is optional: older API deploys don't send it.
      const data = await apiGet<{ sessions: LiveSessionSummary[]; upcoming?: UpcomingLiveSummary[] }>("/api/live");
      setSessions(data.sessions);
      setUpcoming(data.upcoming ?? []);
    } catch {
      setSessions((cur) => cur ?? []);
    }
  }, []);

  // Fresh whenever this screen/tab is in view: on focus, every 20s while
  // focused, and when the app returns to the foreground. It used to load
  // once on mount — and the Socials tab stays mounted — so Lives that
  // started later never showed until the app restarted.
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    load();
    const id = setInterval(load, 45_000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [isFocused, load]);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser.getIdToken().then(async (idToken) => {
      const data = await apiGet<{ giftsXg: number }>("/api/live/earnings", idToken);
      setEarningsXg(data.giftsXg);
    });
  }, [firebaseUser]);

  if (!sessions) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={sessions}
      numColumns={2}
      columnWrapperStyle={styles.row}
      keyExtractor={(s) => s.id}
      onRefresh={load}
      refreshing={false}
      ListHeaderComponent={
        <>
          <TouchableOpacity style={styles.goLiveButton} onPress={() => navigation.navigate("GoLive")} activeOpacity={0.85}>
            <BroadcastIcon size={20} />
            <Text style={styles.goLiveButtonText}>Go Live</Text>
          </TouchableOpacity>
          <View style={styles.noticeRow}>
            <ShieldIcon size={14} color={colors.ink3} />
            <Text style={styles.noticeText}>Lives aren&apos;t saved. Only stats and gift records are kept.</Text>
          </View>
          {earningsXg !== null && (
            <TouchableOpacity style={styles.earningsRow} onPress={() => navigation.navigate("LiveCoins")}>
              <View style={styles.earningsLeft}>
                <XgCoin size={24} />
                <Text style={styles.earningsLabel}>Earnings from gifts</Text>
              </View>
              <Text style={styles.earningsValue}>{earningsXg.toLocaleString("en-NG")} XG ›</Text>
            </TouchableOpacity>
          )}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>Live now</Text>
            {sessions.length > 0 && (
              <Text style={styles.sectionCount}>
                {sessions.length} artist{sessions.length === 1 ? "" : "s"}
              </Text>
            )}
          </View>
        </>
      }
      ListEmptyComponent={<Text style={styles.emptyText}>Nobody&apos;s live right now.</Text>}
      ListFooterComponent={
        upcoming.length > 0 ? (
          <View style={styles.upcomingWrap}>
            <TouchableOpacity style={styles.upcomingHeader} onPress={() => setUpcomingOpen((v) => !v)} accessibilityState={{ expanded: upcomingOpen }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.sectionHeader}>
                  Upcoming <Text style={styles.upcomingCount}>· {upcoming.length}</Text>
                </Text>
                {!upcomingOpen && (
                  <Text style={styles.upcomingNext} numberOfLines={1}>
                    Next: {upcoming[0].creator.displayName} — {upcoming[0].title}
                  </Text>
                )}
              </View>
              <Text style={styles.upcomingChevron}>{upcomingOpen ? "▴" : "▾"}</Text>
            </TouchableOpacity>
            {upcomingOpen && (
              <>
                {upcoming.length > 1 && (
                  <TextInput
                    value={upcomingQuery}
                    onChangeText={setUpcomingQuery}
                    placeholder="Search upcoming Lives by artist or title"
                    placeholderTextColor={colors.ink3}
                    style={styles.upcomingSearch}
                    returnKeyType="search"
                  />
                )}
                {upcomingMatches.length === 0 ? (
                  <Text style={styles.emptyText}>No upcoming Lives match "{upcomingQuery.trim()}".</Text>
                ) : (
                  upcomingMatches.map((u) => (
                    <UpcomingRow key={u.id} live={u} onPress={() => navigation.navigate("LiveViewer", { id: u.id })} />
                  ))
                )}
              </>
            )}
          </View>
        ) : null
      }
      renderItem={({ item, index }) => (
        <LiveCard session={item} index={index} onPress={() => navigation.navigate("LiveViewer", { id: item.id })} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  emptyText: { color: colors.ink3, fontSize: 13, textAlign: "center", marginTop: 40 },
  // The mockup's dark pill with a soft red under-glow.
  goLiveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#141416",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 18,
    paddingVertical: 18,
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 10,
  },
  goLiveButtonText: { color: colors.ink, fontSize: 17, fontWeight: "500" },
  noticeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, marginBottom: 16 },
  noticeText: { color: colors.ink3, fontSize: 12, flex: 1 },
  earningsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, marginBottom: 24 },
  earningsLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  earningsLabel: { color: colors.ink, fontSize: 15 },
  earningsValue: { color: colors.amber, fontSize: 15, fontWeight: "600" },
  sectionHeaderRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 },
  sectionHeader: { color: colors.ink, fontSize: 20, fontWeight: "700" },
  sectionCount: { color: colors.ink3, fontSize: 14 },
  row: { gap: 12, marginBottom: 12 },
  upcomingWrap: { marginTop: 24 },
  upcomingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  upcomingCount: { color: colors.ink3, fontSize: 15, fontWeight: "500" },
  upcomingNext: { color: colors.ink3, fontSize: 12, marginTop: 2 },
  upcomingChevron: { color: colors.ink3, fontSize: 16 },
  upcomingSearch: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
    marginBottom: 10,
  },
});

/** One scheduled Live — opens its countdown / Remind me / Share screen. */
function UpcomingRow({ live, onPress }: { live: UpcomingLiveSummary; onPress: () => void }) {
  const when = live.scheduledFor ? new Date(live.scheduledFor) : null;
  return (
    <TouchableOpacity style={rowStyles.row} onPress={onPress} activeOpacity={0.8}>
      <InitialsAvatar name={live.creator.displayName} avatarUrl={live.creator.avatarUrl} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={rowStyles.title} numberOfLines={1}>
          {live.title}
        </Text>
        <Text style={rowStyles.meta} numberOfLines={1}>
          {live.creator.displayName}
          {when ? ` · ${when.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        {live.isPaidAccess && <Text style={rowStyles.price}>{live.priceXg} XG</Text>}
        <Text style={rowStyles.meta}>🔔 {live.reminderCount}</Text>
      </View>
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  title: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  meta: { color: colors.ink3, fontSize: 12, marginTop: 2 },
  price: { color: colors.amber, fontSize: 11, fontWeight: "700" },
});
