import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../lib/AuthContext";
import { apiGet } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { AddBalance } from "../components/live/LiveBits";
import { XgCoin } from "../components/live/LiveIcons";

type BalanceResponse = { balanceXg: number };

// Balance is read natively; the pack list matches the mockup, but tapping a
// pack opens web's checkout instead of a native purchase flow. Deliberate,
// not an oversight: a real-money top-up of a spendable virtual currency is
// exactly the kind of purchase Apple/Google in-app-purchase rules would
// require going through StoreKit/Play Billing if it happened inside the app
// — same "web buys" split as ticket purchase (see EventScreen.tsx's own
// "Get tickets on xoldout.app" button). Revisit if/when native IAP is
// actually built.
export function LiveCoinsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();
  const [balanceXg, setBalanceXg] = useState<number | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: "XG balance" });
  }, [navigation]);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser.getIdToken().then(async (idToken) => {
      const data = await apiGet<BalanceResponse>("/api/coins", idToken);
      setBalanceXg(data.balanceXg);
    });
  }, [firebaseUser]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.label}>Your balance</Text>
        <View style={styles.balanceRow}>
          <XgCoin size={24} />
          {balanceXg === null ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Text style={styles.balance}>{balanceXg.toLocaleString("en-NG")} XG</Text>
          )}
        </View>
      </View>

      <AddBalance />
      <Text style={styles.footnote}>XG can&apos;t be redeemed for cash.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 28,
  },
  label: { color: colors.ink2, fontSize: 14 },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  balance: { color: colors.amber, fontSize: 20, fontWeight: "700" },
  footnote: { color: colors.ink3, fontSize: 12, marginTop: 8, paddingLeft: 22 },
});
