import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../lib/AuthContext";
import { apiGet } from "../lib/api";
import { formatNaira } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import type { WalletData, Payout } from "../lib/walletTypes";
import { colors, fonts } from "../lib/theme";

// Explicit ask, 2026-08-31, "for now" (matches web's own note in
// app/(app)/wallet/page.tsx): the 7-day settlement hold is off, so a sale
// is withdrawable immediately.
const COMMISSION_RATE = 0.12;
const EVENT_COMMISSION_RATE = 0.05;

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Pending", color: colors.ink3 },
  PROCESSING: { label: "Processing", color: "#c9902e" },
  PAID: { label: "Paid", color: "#3f9d5b" },
  FAILED: { label: "Failed", color: colors.redSoft },
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function PayoutDetailModal({ payout, onClose }: { payout: Payout | null; onClose: () => void }) {
  if (!payout) return null;
  const status = STATUS_META[payout.status] ?? { label: payout.status, color: colors.ink3 };

  return (
    <Modal visible={!!payout} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Withdrawal details</Text>
          <Text style={[styles.sheetStatus, { color: status.color }]}>{status.label.toUpperCase()}</Text>

          <View style={styles.detailBlock}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Amount</Text>
              <Text style={styles.detailValue}>{formatNaira(payout.amountKobo)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Fee</Text>
              <Text style={styles.detailValue}>{formatNaira(payout.feeKobo)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>You received</Text>
              <Text style={[styles.detailValue, styles.detailValueStrong]}>{formatNaira(payout.netKobo)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Bank account</Text>
              <Text style={styles.detailValue}>
                {payout.payoutAccount.accountName}
                {"\n"}
                {payout.payoutAccount.bankName} ···{payout.payoutAccount.accountNumber.slice(-4)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>{formatDateTime(payout.createdAt)}</Text>
            </View>
          </View>

          {payout.status === "FAILED" && (
            <Text style={styles.sheetNote}>This withdrawal didn't go through — the amount was returned to your available balance.</Text>
          )}
          {payout.status === "PROCESSING" && (
            <Text style={styles.sheetNote}>Usually a few minutes to a few hours — check back to see it update.</Text>
          )}

          <TouchableOpacity style={styles.sheetClose} onPress={onClose}>
            <Text style={styles.sheetCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function WalletScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();
  const [data, setData] = useState<WalletData | null>(null);
  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: "Wallet" });
  }, [navigation]);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser.getIdToken().then((idToken) => apiGet<WalletData>("/api/wallet", idToken).then(setData));
  }, [firebaseUser]);

  if (!data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available</Text>
        <Text style={styles.balanceValue}>{formatNaira(data.availableKobo)}</Text>
      </View>
      <Text style={styles.commissionNote}>
        Totals shown are after our platform fee — {Math.round(COMMISSION_RATE * 100)}% on music, beats, and merch;{" "}
        {Math.round(EVENT_COMMISSION_RATE * 100)}% on ticket sales.
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Pending</Text>
          <Text style={styles.statValue}>{formatNaira(data.pendingKobo)}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Total earned</Text>
          <Text style={styles.statValue}>{formatNaira(data.totalEarnedKobo)}</Text>
        </View>
      </View>

      <Text style={styles.availableNote}>Your earnings are available to withdraw right away — no waiting period.</Text>

      <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate("Withdraw")}>
        <Text style={styles.primaryButtonText}>Withdraw</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate("PayoutAccounts")}>
        <Text style={styles.secondaryButtonText}>Payout accounts</Text>
      </TouchableOpacity>

      {Object.keys(data.earnedByCategory).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Earned by category</Text>
          {Object.entries(data.earnedByCategory).map(([type, kobo]) => (
            <View key={type} style={styles.categoryRow}>
              <Text style={styles.categoryLabel}>{type.charAt(0) + type.slice(1).toLowerCase()}</Text>
              <Text style={styles.categoryValue}>{formatNaira(kobo)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payout history</Text>
        {data.payouts.length === 0 ? (
          <Text style={styles.emptyText}>No payouts yet.</Text>
        ) : (
          data.payouts.map((p) => {
            const status = STATUS_META[p.status] ?? { label: p.status, color: colors.ink3 };
            return (
              <TouchableOpacity key={p.id} style={styles.payoutRow} onPress={() => setSelectedPayout(p)}>
                <View>
                  <Text style={styles.payoutAmount}>{formatNaira(p.netKobo)}</Text>
                  <Text style={styles.payoutMeta}>
                    {p.payoutAccount.bankName} ···{p.payoutAccount.accountNumber.slice(-4)}
                  </Text>
                </View>
                <Text style={[styles.payoutStatus, { color: status.color }]}>{status.label.toUpperCase()}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <PayoutDetailModal payout={selectedPayout} onClose={() => setSelectedPayout(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  balanceCard: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 6 },
  balanceLabel: { color: colors.ink3, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" },
  balanceValue: { color: colors.ink, fontSize: 32, fontFamily: fonts.serif, marginTop: 2 },
  commissionNote: { color: colors.ink3, fontSize: 11, marginBottom: 14 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  statBox: { flex: 1, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 12, padding: 12 },
  statLabel: { color: colors.ink3, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" },
  statValue: { color: colors.ink, fontSize: 18, fontFamily: fonts.serif, marginTop: 2 },
  availableNote: { color: colors.ink3, fontSize: 12, marginBottom: 16 },
  primaryButton: { backgroundColor: colors.red, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  primaryButtonText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  secondaryButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginBottom: 24 },
  secondaryButtonText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  section: { marginBottom: 24 },
  sectionTitle: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10 },
  categoryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  categoryLabel: { color: colors.ink2, fontSize: 13 },
  categoryValue: { color: colors.ink, fontSize: 13, fontFamily: fonts.serif },
  emptyText: { color: colors.ink3, fontSize: 13 },
  payoutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  payoutAmount: { color: colors.ink, fontSize: 14 },
  payoutMeta: { color: colors.ink3, fontSize: 11, marginTop: 1 },
  payoutStatus: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.5 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  sheetTitle: { color: colors.ink, fontSize: 20, fontFamily: fonts.serif, marginBottom: 4 },
  sheetStatus: { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 16 },
  detailBlock: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.lineSoft, marginBottom: 16 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  detailLabel: { color: colors.ink3, fontSize: 13 },
  detailValue: { color: colors.ink, fontSize: 13, textAlign: "right" },
  detailValueStrong: { fontWeight: "700", fontFamily: fonts.serif },
  sheetNote: { color: colors.ink3, fontSize: 12, marginBottom: 16 },
  sheetClose: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  sheetCloseText: { color: colors.ink2, fontSize: 14, fontWeight: "600" },
});
