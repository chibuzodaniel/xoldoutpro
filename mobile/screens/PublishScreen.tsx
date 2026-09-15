import { SafeAreaView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import type { RootStackParamList } from "../lib/navigation";
import { colors, fonts } from "../lib/theme";

const OPTIONS = [
  { key: "PublishMusic" as const, title: "Upload Music", subtitle: "Single, EP, or album, free or paid" },
  { key: "PublishBeat" as const, title: "Upload Beat", subtitle: "Beats, sample packs, drum kits, presets" },
  { key: "PublishEvent" as const, title: "Create Event", subtitle: "Concerts, listening parties, workshops" },
  { key: "PublishMerch" as const, title: "Add Merchandise", subtitle: "Apparel, posters, digital or physical goods" },
];

export function PublishScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>What are you publishing?</Text>
      <View style={styles.list}>
        {OPTIONS.map((opt) => (
          <TouchableOpacity key={opt.key} style={styles.row} onPress={() => navigation.navigate(opt.key)}>
            <View>
              <Text style={styles.rowTitle}>{opt.title}</Text>
              <Text style={styles.rowSubtitle}>{opt.subtitle}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  title: { color: colors.ink, fontSize: 22, fontFamily: fonts.serif, marginBottom: 20 },
  list: { borderTopWidth: 1, borderColor: colors.lineSoft },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  rowSubtitle: { color: colors.ink3, fontSize: 12, marginTop: 2 },
  chevron: { color: colors.ink3, fontSize: 18 },
});
