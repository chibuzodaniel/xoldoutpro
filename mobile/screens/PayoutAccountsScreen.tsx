import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../lib/AuthContext";
import { apiGet, apiPost, apiPatch } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";
import type { Bank, PayoutAccount } from "../lib/walletTypes";
import { colors } from "../lib/theme";
import { BankSelectSheet } from "../components/BankSelectSheet";

export function PayoutAccountsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();
  const [accounts, setAccounts] = useState<PayoutAccount[] | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [bankSheetOpen, setBankSheetOpen] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: "Payout accounts" });
  }, [navigation]);

  const loadAccounts = useCallback(async () => {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    const data = await apiGet<{ accounts: PayoutAccount[] }>("/api/wallet/payout-accounts", idToken);
    setAccounts(data.accounts);
  }, [firebaseUser]);

  useEffect(() => {
    loadAccounts();
    firebaseUser?.getIdToken().then((idToken) =>
      apiGet<{ banks: Bank[] }>("/api/wallet/banks", idToken)
        .then((d) => setBanks(d.banks))
        .catch(() => {}),
    );
  }, [firebaseUser, loadAccounts]);

  async function handleAdd() {
    if (!firebaseUser || !selectedBank || accountNumber.length !== 10) return;
    setBusy(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPost("/api/wallet/payout-accounts", idToken, {
        accountNumber,
        bankCode: selectedBank.code,
        bankName: selectedBank.name,
      });
      setAccountNumber("");
      setSelectedBank(null);
      await loadAccounts();
      Alert.alert("Payout account added");
    } catch (e) {
      Alert.alert("Could not verify that account", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetDefault(id: string) {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    await apiPatch(`/api/wallet/payout-accounts/${id}`, idToken);
    loadAccounts();
  }

  if (!accounts) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {accounts.length > 0 && (
        <View style={styles.list}>
          {accounts.map((a) => (
            <View key={a.id} style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>{a.accountName}</Text>
                <Text style={styles.rowMeta}>
                  {a.bankName} ···{a.accountNumber.slice(-4)}
                </Text>
              </View>
              {a.isDefault ? (
                <Text style={styles.defaultLabel}>Default</Text>
              ) : (
                <TouchableOpacity onPress={() => handleSetDefault(a.id)}>
                  <Text style={styles.makeDefault}>Make default</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>Add an account</Text>
      <TouchableOpacity style={styles.bankPicker} onPress={() => setBankSheetOpen(true)}>
        <Text style={selectedBank ? styles.bankPickerText : styles.bankPickerPlaceholder}>
          {selectedBank?.name ?? "Select bank"}
        </Text>
      </TouchableOpacity>
      <TextInput
        value={accountNumber}
        onChangeText={(v) => setAccountNumber(v.replace(/\D/g, "").slice(0, 10))}
        placeholder="10-digit account number"
        placeholderTextColor={colors.ink3}
        keyboardType="numeric"
        maxLength={10}
        style={styles.input}
      />
      <TouchableOpacity
        style={[styles.submitButton, (busy || !selectedBank || accountNumber.length !== 10) && styles.submitButtonDisabled]}
        onPress={handleAdd}
        disabled={busy || !selectedBank || accountNumber.length !== 10}
      >
        {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitButtonText}>Verify and add</Text>}
      </TouchableOpacity>

      <BankSelectSheet
        visible={bankSheetOpen}
        banks={banks}
        onSelect={(bank) => {
          setSelectedBank(bank);
          setBankSheetOpen(false);
        }}
        onClose={() => setBankSheetOpen(false)}
      />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  list: { marginBottom: 24 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  rowInfo: { flex: 1 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  rowMeta: { color: colors.ink3, fontSize: 12, marginTop: 1 },
  defaultLabel: { color: colors.redSoft, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" },
  makeDefault: { color: colors.ink3, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" },
  sectionTitle: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10 },
  bankPicker: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 10 },
  bankPickerText: { color: colors.ink, fontSize: 14 },
  bankPickerPlaceholder: { color: colors.ink3, fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: colors.ink,
    fontSize: 14,
    marginBottom: 12,
  },
  submitButton: { backgroundColor: colors.red, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
});
