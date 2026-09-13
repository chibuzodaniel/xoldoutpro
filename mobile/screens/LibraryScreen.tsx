import { useState } from "react";
import { ActivityIndicator, SafeAreaView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { useAuth } from "../lib/AuthContext";
import type { BottomTabParamList } from "../lib/tabNavigation";
import { colors, fonts } from "../lib/theme";
import { PurchasedTab } from "../components/library/PurchasedTab";
import { CollectionsTab } from "../components/library/CollectionsTab";
import { GiftsTab } from "../components/library/GiftsTab";

const TABS = [
  { key: "purchased", label: "Purchased" },
  { key: "collections", label: "Collections" },
  { key: "gifts", label: "Gifts" },
] as const;
type LibraryTab = (typeof TABS)[number]["key"];

export function LibraryScreen() {
  const navigation = useNavigation<NavigationProp<BottomTabParamList>>();
  const { appUser, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<LibraryTab>("purchased");

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
        <TouchableOpacity style={styles.signInButton} onPress={() => navigation.navigate("Profile")}>
          <Text style={styles.signInButtonText}>Go to Profile</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Library</Text>
        <View style={styles.tabsRow}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={styles.tabButton}>
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
              {tab === t.key && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {tab === "purchased" && <PurchasedTab />}
      {tab === "collections" && <CollectionsTab />}
      {tab === "gifts" && <GiftsTab />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 12 },
  emptyTitle: { color: colors.ink, fontSize: 15 },
  signInButton: { backgroundColor: colors.red, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12 },
  signInButtonText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  header: { paddingHorizontal: 16, paddingTop: 50 },
  pageTitle: { color: colors.ink, fontSize: 24, fontFamily: fonts.serif, marginBottom: 16 },
  tabsRow: { flexDirection: "row", gap: 20, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  tabButton: { paddingBottom: 10 },
  tabLabel: { color: colors.ink3, fontSize: 14, fontWeight: "600" },
  tabLabelActive: { color: colors.ink },
  tabUnderline: { height: 2, backgroundColor: colors.red, marginTop: 8, borderRadius: 1 },
});
