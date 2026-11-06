import { useEffect, useState } from "react";
import { ActivityIndicator, SafeAreaView, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { Svg, Path, Circle } from "react-native-svg";
import { useIsFocused, useNavigation, type NavigationProp } from "@react-navigation/native";
import { useAuth } from "../lib/AuthContext";
import { apiGet } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";
import { colors, fonts } from "../lib/theme";
import { SwipeableIndexView } from "../components/SwipeableIndexView";
import { PurchasedTab } from "../components/library/PurchasedTab";
import { CollectionsTab } from "../components/library/CollectionsTab";

// Library redesign (explicit ask, 2026-11-04): big serif title with a
// one-line description, search + notifications on the right, and Purchased /
// Collections / Events tabs. The old Gifts tab is gone — a claimed gift
// already shows up under Purchased like any other purchase.
const TABS = [
  { key: "purchased", label: "Purchased" },
  { key: "collections", label: "Collections" },
  { key: "events", label: "Events" },
] as const;
type LibraryTab = (typeof TABS)[number]["key"];

function SearchIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
      <Circle cx={11} cy={11} r={7} />
      <Path d="M20 20l-4.3-4.3" strokeLinecap="round" />
    </Svg>
  );
}

function BellIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
      <Path d="M18 8a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10 20a2 2 0 004 0" strokeLinecap="round" />
    </Svg>
  );
}

export function LibraryScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const { appUser, firebaseUser, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<LibraryTab>("purchased");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  // The bell's red dot — one fetch each time the Library comes into view, no polling.
  useEffect(() => {
    if (!isFocused || !firebaseUser) return;
    firebaseUser
      .getIdToken()
      .then((idToken) => apiGet<{ unreadCount: number }>("/api/notifications", idToken))
      .then((data) => setUnreadCount(data.unreadCount))
      .catch(() => {});
  }, [isFocused, firebaseUser]);

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (!appUser) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Sign in to see your library</Text>
        <TouchableOpacity style={styles.signInButton} onPress={() => navigation.navigate("Tabs", { screen: "Profile" })}>
          <Text style={styles.signInButtonText}>Go to Profile</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.pageTitle}>Library</Text>
            <Text style={styles.subtitle}>Your saved music, purchases and event tickets.</Text>
          </View>
          <View style={styles.icons}>
            <TouchableOpacity onPress={() => setSearchOpen((v) => !v)} hitSlop={10} accessibilityLabel="Search your library">
              <SearchIcon color={searchOpen ? colors.redSoft : colors.ink2} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate("Notifications")} hitSlop={10} accessibilityLabel="Notifications">
              <BellIcon color={colors.ink2} />
              {unreadCount > 0 && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          </View>
        </View>

        {searchOpen && (
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search your songs, merch and tickets…"
            placeholderTextColor={colors.ink3}
            style={styles.search}
            returnKeyType="search"
          />
        )}

        <View style={styles.tabsRow}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={styles.tabButton}>
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
              <View style={[styles.tabUnderline, tab !== t.key && { backgroundColor: "transparent" }]} />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <SwipeableIndexView index={TABS.findIndex((t) => t.key === tab)} count={TABS.length} onChangeIndex={(i) => setTab(TABS[i].key)}>
        {/* One PurchasedTab instance for both Purchased and Events, so switching between them doesn't refetch. */}
        {tab === "collections" ? <CollectionsTab /> : <PurchasedTab view={tab} query={query} />}
      </SwipeableIndexView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 12 },
  emptyTitle: { color: colors.ink, fontSize: 15 },
  signInButton: { backgroundColor: colors.red, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12 },
  signInButtonText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  header: { paddingHorizontal: 16, paddingTop: 56 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 18 },
  pageTitle: { color: colors.ink, fontSize: 40, lineHeight: 46, fontFamily: fonts.serif },
  subtitle: { color: colors.ink3, fontSize: 14, marginTop: 4 },
  icons: { flexDirection: "row", alignItems: "center", gap: 20, paddingTop: 10 },
  unreadDot: { position: "absolute", top: -1, right: -1, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.red, borderWidth: 1.5, borderColor: colors.bg },
  search: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
    marginBottom: 14,
  },
  tabsRow: { flexDirection: "row", gap: 36, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  tabButton: { paddingTop: 2 },
  tabLabel: { color: colors.ink3, fontSize: 15, fontWeight: "600" },
  tabLabelActive: { color: colors.ink },
  tabUnderline: { height: 3, backgroundColor: colors.red, marginTop: 10, borderRadius: 2, marginBottom: -1 },
});
