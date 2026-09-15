import { Pressable, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../lib/navigation";
import { colors, fonts } from "../lib/theme";

const OPTIONS = [
  { key: "PublishMusic" as const, title: "Upload Music", subtitle: "Single, EP, or album, free or paid" },
  { key: "PublishBeat" as const, title: "Upload Beat", subtitle: "Beats, sample packs, drum kits, presets" },
  { key: "PublishEvent" as const, title: "Create Event", subtitle: "Concerts, listening parties, workshops" },
  { key: "PublishMerch" as const, title: "Add Merchandise", subtitle: "Apparel, posters, digital or physical goods" },
];

// Mirrors web's components/nav/PublishSheet.tsx: a bottom sheet sized to
// its own content, not a full-screen page — rendered here as a
// transparentModal stack screen (see App.tsx) so this component owns the
// backdrop and sheet sizing itself, the same way the web version does.
export function PublishScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => navigation.goBack()} />
      <View style={styles.sheet}>
        <Text style={styles.title}>What are you publishing?</Text>
        <View style={styles.list}>
          {OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={styles.row}
              onPress={() => navigation.replace(opt.key)}
            >
              <View>
                <Text style={styles.rowTitle}>{opt.title}</Text>
                <Text style={styles.rowSubtitle}>{opt.subtitle}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.lineSoft,
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 32,
  },
  title: { color: colors.ink, fontSize: 22, fontFamily: fonts.serif, marginBottom: 20 },
  list: { borderTopWidth: 1, borderColor: colors.lineSoft, marginBottom: 14 },
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
  cancelButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  cancelText: { color: colors.ink2, fontSize: 14, fontWeight: "600" },
});
