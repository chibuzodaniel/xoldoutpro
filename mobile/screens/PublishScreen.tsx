import { useState } from "react";
import { Pressable, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../lib/navigation";
import { colors, fonts } from "../lib/theme";
import { useAuth } from "../lib/AuthContext";
import { PlanPickerModal } from "../components/PlanPickerModal";

const OPTIONS = [
  { key: "PublishMusic" as const, title: "Upload Music", subtitle: "Single, EP, or album, free or paid" },
  { key: "PublishBeat" as const, title: "Upload Beat", subtitle: "Beats, sample packs, drum kits, presets" },
  { key: "PublishEvent" as const, title: "Create Event", subtitle: "Concerts, listening parties, workshops" },
  { key: "PublishMerch" as const, title: "Add Merchandise", subtitle: "Apparel, posters, digital or physical goods" },
];

const PLAN_LABEL: Record<"UNLIMITED" | "BUYER_PAYS_FEE" | "LIMITED", string> = {
  UNLIMITED: "Unlimited",
  BUYER_PAYS_FEE: "Buyer Pays Fee",
  LIMITED: "Limited",
};

// Mirrors web's components/nav/PublishSheet.tsx: a bottom sheet sized to
// its own content, not a full-screen page — rendered here as a
// transparentModal stack screen (see App.tsx) so this component owns the
// backdrop and sheet sizing itself, the same way the web version does.
//
// A plan is required before publishing at all (forced PlanPickerModal if
// unset); even once one is set, "Plan: X · Switch" stays visible here so
// switching doesn't require a detour through Edit Profile first (explicit
// ask, same as web's PublishOptionsList).
export function PublishScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { appUser } = useAuth();
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const plan = appUser?.creatorPlan ?? null;

  function handleOptionPress(key: (typeof OPTIONS)[number]["key"]) {
    if (!plan) {
      setPlanModalOpen(true);
      return;
    }
    navigation.replace(key);
  }

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => navigation.goBack()} />
      <View style={styles.sheet}>
        <Text style={styles.title}>What are you publishing?</Text>
        <TouchableOpacity style={styles.planRow} onPress={() => setPlanModalOpen(true)}>
          <Text style={styles.planRowText}>Plan: {plan ? PLAN_LABEL[plan] : "Not chosen"}</Text>
          <Text style={styles.planRowSwitch}>Switch</Text>
        </TouchableOpacity>
        <View style={styles.list}>
          {OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={styles.row}
              onPress={() => handleOptionPress(opt.key)}
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
      <PlanPickerModal visible={planModalOpen} onClose={() => setPlanModalOpen(false)} />
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
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  planRowText: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  planRowSwitch: { color: colors.redSoft, fontSize: 12, fontWeight: "600" },
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
