import { ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { colors } from "../lib/theme";

export type CategoryType = "RELEASE" | "BEAT" | "EVENT" | "MERCH" | null;

const TABS: { label: string; type: CategoryType }[] = [
  { label: "All", type: null },
  { label: "Music", type: "RELEASE" },
  { label: "Beats", type: "BEAT" },
  { label: "Events", type: "EVENT" },
  { label: "Merch", type: "MERCH" },
];

// Mirrors web's components/nav/CategoryTabs.tsx — "All" goes back to the
// plain Discover feed, each other tab opens the single-category browse view.
export function CategoryTabs({ active, onSelect }: { active: CategoryType; onSelect: (type: CategoryType) => void }) {
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        {TABS.map((tab) => {
          const isActive = tab.type === active;
          return (
            <TouchableOpacity key={tab.label} style={styles.tab} onPress={() => onSelect(tab.type)}>
              <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
              {isActive && <View style={styles.underline} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Explicit height + flexGrow/flexShrink: 0 — a horizontal ScrollView with
  // no size constraints of its own can otherwise stretch to fill the
  // column parent's remaining vertical space instead of sizing to its
  // single row of tabs, which is what produced a large empty gap between
  // this and the Hero card below it.
  wrap: { height: 44, flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  content: { paddingHorizontal: 16, gap: 20, alignItems: "center" },
  tab: { paddingBottom: 10, position: "relative" },
  label: { color: colors.ink3, fontSize: 14, fontWeight: "600" },
  labelActive: { color: colors.ink },
  underline: { position: "absolute", bottom: -1, left: 0, right: 0, height: 2, borderRadius: 1, backgroundColor: colors.red },
});
