import { useState } from "react";
import { Linking, Modal, Pressable, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useAuth } from "../lib/AuthContext";
import { apiPost } from "../lib/api";
import { useToast } from "./ToastProvider";
import { colors, fonts } from "../lib/theme";

type Plan = "UNLIMITED" | "BUYER_PAYS_FEE" | "LIMITED";

const OPTIONS: { value: Plan; label: string; description: string }[] = [
  { value: "UNLIMITED", label: "Unlimited", description: "XOLDOUT takes a commission per sale. No upload limit, keep publishing freely." },
  {
    value: "BUYER_PAYS_FEE",
    label: "Buyer Pays Fee",
    description: "You keep 100% of your price — the buyer pays a service charge on top at checkout. Upload storage is capped; buy more room as you grow.",
  },
  {
    value: "LIMITED",
    label: "Limited",
    description: "Pay a flat fee to unlock a batch of uploads and keep 100% of every sale. Renew (same fee) once you hit the sales cap.",
  },
];

// Mirrors web's PlanPickerSheet. Mobile never collects payment directly
// (same web-buys/mobile-plays split as buying a product — ProductScreen's
// "Buy on xoldout.app") — a LIMITED join/renewal opens the Bachs checkout
// in the system browser via Linking.openURL instead of an in-app payment
// flow; the app picks the new plan up next time it's foregrounded and
// refreshAppUser() runs.
export function PlanPickerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { firebaseUser, refreshAppUser } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<Plan | null>(null);

  async function choose(plan: Plan) {
    if (!firebaseUser) return;
    setBusy(plan);
    try {
      const idToken = await firebaseUser.getIdToken();
      const data = await apiPost<{ mode: "instant" | "wallet" | "bachs"; checkoutUrl?: string }>("/api/me/plan", idToken, { plan });
      if (data.mode === "bachs" && data.checkoutUrl) {
        await Linking.openURL(data.checkoutUrl);
        onClose();
        return;
      }
      await refreshAppUser();
      toast.success(plan === "LIMITED" ? "Limited plan activated." : `Switched to ${OPTIONS.find((o) => o.value === plan)?.label}.`);
      onClose();
    } catch {
      toast.error("Could not update your plan");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Choose your creator plan</Text>
          <Text style={styles.subtitle}>You can switch plans any time.</Text>
          <View style={styles.list}>
            {OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={styles.row}
                disabled={busy !== null}
                onPress={() => choose(opt.value)}
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{opt.label}</Text>
                  <Text style={styles.rowSubtitle}>{opt.description}</Text>
                </View>
                <Text style={styles.chevron}>{busy === opt.value ? "…" : "›"}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
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
  title: { color: colors.ink, fontSize: 20, fontFamily: fonts.serif, marginBottom: 4 },
  subtitle: { color: colors.ink3, fontSize: 13, marginBottom: 16 },
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowText: { flex: 1 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  rowSubtitle: { color: colors.ink3, fontSize: 12, marginTop: 3 },
  chevron: { color: colors.ink3, fontSize: 16 },
});
