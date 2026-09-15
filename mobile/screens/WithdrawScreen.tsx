import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../lib/AuthContext";
import { apiGet, apiPost } from "../lib/api";
import { formatNaira } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import type { PayoutAccount, WalletData } from "../lib/walletTypes";
import { colors } from "../lib/theme";

const MINIMUM_WITHDRAWAL_KOBO = 100_000; // ₦1,000 — mirrors web's lib/commerce/constants.ts

export function WithdrawScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();
  const [availableKobo, setAvailableKobo] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
  const [payoutAccountId, setPayoutAccountId] = useState("");
  const [amountNaira, setAmountNaira] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: "Withdraw" });
  }, [navigation]);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser.getIdToken().then(async (idToken) => {
      const [wallet, accountsData] = await Promise.all([
        apiGet<WalletData>("/api/wallet", idToken),
        apiGet<{ accounts: PayoutAccount[] }>("/api/wallet/payout-accounts", idToken),
      ]);
      setAvailableKobo(wallet.availableKobo);
      setAccounts(accountsData.accounts);
      setPayoutAccountId(accountsData.accounts.find((a) => a.isDefault)?.id ?? accountsData.accounts[0]?.id ?? "");
      setLoaded(true);
    });
  }, [firebaseUser]);

  const amountKobo = Math.round(parseFloat(amountNaira || "0") * 100);

  function setPercent(pct: number) {
    if (availableKobo === null) return;
    setAmountNaira((Math.floor((availableKobo * pct) / 100) / 100).toFixed(2));
  }

  async function handleSubmit() {
    if (!firebaseUser) return;
    if (!payoutAccountId) return Alert.alert("Add a payout account first");
    if (!amountKobo || amountKobo <= 0) return Alert.alert("Enter an amount");
    if (amountKobo < MINIMUM_WITHDRAWAL_KOBO) return Alert.alert(`The minimum withdrawal is ${formatNaira(MINIMUM_WITHDRAWAL_KOBO)}`);
    if (availableKobo !== null && amountKobo > availableKobo) return Alert.alert("Amount exceeds available balance");

    setBusy(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPost("/api/wallet/withdraw", idToken, { amountKobo, payoutAccountId });
      Alert.alert("Withdrawal started", "You'll be notified once it's sent.", [
        { text: "OK", onPress: () => navigation.navigate("Wallet") },
      ]);
    } catch (e) {
      Alert.alert("Could not start withdrawal", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (accounts.length === 0) {
    return (
      <View style={styles.content}>
        <Text style={styles.emptyText}>Add a payout account before you can withdraw.</Text>
        <TouchableOpacity onPress={() => navigation.navigate("PayoutAccounts")}>
          <Text style={styles.emptyLink}>Add payout account →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.availableText}>{availableKobo !== null ? `${formatNaira(availableKobo)} available` : "Loading…"}</Text>
      <Text style={styles.minText}>Minimum withdrawal: {formatNaira(MINIMUM_WITHDRAWAL_KOBO)}</Text>

      <View style={styles.amountRow}>
        <Text style={styles.naira}>₦</Text>
        <TextInput
          value={amountNaira}
          onChangeText={setAmountNaira}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.ink3}
          style={styles.amountInput}
        />
      </View>
      <View style={styles.percentRow}>
        {[25, 50, 100].map((pct) => (
          <TouchableOpacity key={pct} style={styles.percentButton} onPress={() => setPercent(pct)}>
            <Text style={styles.percentText}>{pct === 100 ? "Max" : `${pct}%`}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Destination account</Text>
      {accounts.map((a) => (
        <TouchableOpacity
          key={a.id}
          style={[styles.accountRow, payoutAccountId === a.id && styles.accountRowActive]}
          onPress={() => setPayoutAccountId(a.id)}
        >
          <Text style={styles.accountText}>
            {a.bankName} ···{a.accountNumber.slice(-4)} — {a.accountName}
          </Text>
        </TouchableOpacity>
      ))}

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Fee</Text>
          <Text style={styles.summaryValue}>₦0</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabelStrong}>You receive</Text>
          <Text style={styles.summaryValueStrong}>{formatNaira(amountKobo)}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitButtonText}>Withdraw</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  emptyText: { color: colors.ink3, fontSize: 14, marginBottom: 12 },
  emptyLink: { color: colors.redSoft, fontSize: 14, fontWeight: "600" },
  availableText: { color: colors.ink2, fontSize: 14, marginBottom: 2 },
  minText: { color: colors.ink3, fontSize: 12, marginBottom: 20 },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  naira: { color: colors.ink3, fontSize: 20 },
  amountInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.ink,
    fontSize: 20,
  },
  percentRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  percentButton: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  percentText: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  label: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 },
  accountRow: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 10, padding: 14, marginBottom: 8 },
  accountRowActive: { borderColor: colors.red, backgroundColor: "rgba(225,29,46,0.08)" },
  accountText: { color: colors.ink, fontSize: 13 },
  summaryCard: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginTop: 12, marginBottom: 20, gap: 6 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { color: colors.ink3, fontSize: 13 },
  summaryValue: { color: colors.ink3, fontSize: 13 },
  summaryLabelStrong: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  summaryValueStrong: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  submitButton: { backgroundColor: colors.red, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  submitButtonText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
});
