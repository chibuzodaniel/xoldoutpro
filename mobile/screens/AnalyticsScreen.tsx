import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../lib/AuthContext";
import { apiGet } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";
import type { AnalyticsData, BuyersData } from "../lib/walletTypes";
import { colors, fonts } from "../lib/theme";

const TYPE_LABEL: Record<string, string> = { RELEASE: "Music", BEAT: "Beat", EVENT: "Event", MERCH: "Merch" };

function formatDuration(hours: number) {
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem ? `${days}d ${rem}h` : `${days}d`;
}

export function AnalyticsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [buyers, setBuyers] = useState<BuyersData | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: "Analytics" });
  }, [navigation]);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser.getIdToken().then((idToken) => {
      apiGet<AnalyticsData>("/api/analytics", idToken).then(setData);
      apiGet<BuyersData>("/api/analytics/buyers", idToken)
        .then(setBuyers)
        .catch(() => setBuyers({ summary: { paidUnits: 0, refundedUnits: 0, uniqueBuyers: 0 }, sales: [] }));
    });
  }, [firebaseUser]);

  if (!data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  const { totals, topProducts } = data;
  const returningPct = totals.totalCustomers > 0 ? Math.round((totals.returningCustomers / totals.totalCustomers) * 100) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>How your work is performing. No money here — see Wallet for that.</Text>

      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{totals.unitsSold}</Text>
          <Text style={styles.statLabel}>Units sold</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{totals.fans}</Text>
          <Text style={styles.statLabel}>Fans</Text>
          {totals.newFans30d > 0 && <Text style={styles.statNote}>+{totals.newFans30d} in 30d</Text>}
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{totals.sellOutRatePct !== null ? `${totals.sellOutRatePct}%` : "—"}</Text>
          <Text style={styles.statLabel}>Sell-out rate</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{returningPct !== null ? `${returningPct}%` : "—"}</Text>
          <Text style={styles.statLabel}>Returning fans</Text>
          {totals.totalCustomers > 0 && (
            <Text style={styles.statNote}>
              {totals.returningCustomers} of {totals.totalCustomers}
            </Text>
          )}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Top products</Text>
      {topProducts.length === 0 ? (
        <Text style={styles.emptyText}>Nothing published yet.</Text>
      ) : (
        <View style={styles.list}>
          {topProducts.map((p) => (
            <View key={p.id} style={styles.row}>
              <View style={styles.rowTop}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Text style={styles.rowType}>{TYPE_LABEL[p.type] ?? p.type}</Text>
                </View>
                <Text style={styles.rowSold}>{p.sold}</Text>
              </View>
              {(p.sellThroughPct !== null || p.timeToSellOutHours !== null) && (
                <Text style={styles.rowMeta}>
                  {p.sellThroughPct !== null && `Sell-through ${p.sellThroughPct}% (${p.sold}/${p.cap})`}
                  {p.sellThroughPct !== null && p.timeToSellOutHours !== null && " · "}
                  {p.timeToSellOutHours !== null && `Sold out in ${formatDuration(p.timeToSellOutHours)}`}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Buyers</Text>
      {buyers === null ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <>
          <View style={styles.buyerStats}>
            <View style={styles.buyerStat}>
              <Text style={styles.buyerStatLabel}>Units sold</Text>
              <Text style={styles.buyerStatValue}>{buyers.summary.paidUnits}</Text>
            </View>
            <View style={styles.buyerStat}>
              <Text style={styles.buyerStatLabel}>Refunded</Text>
              <Text style={[styles.buyerStatValue, buyers.summary.refundedUnits > 0 && { color: colors.redSoft }]}>
                {buyers.summary.refundedUnits}
              </Text>
            </View>
            <View style={styles.buyerStat}>
              <Text style={styles.buyerStatLabel}>Buyers</Text>
              <Text style={styles.buyerStatValue}>{buyers.summary.uniqueBuyers}</Text>
            </View>
          </View>
          {buyers.sales.length === 0 ? (
            <Text style={styles.emptyText}>No sales yet.</Text>
          ) : (
            buyers.sales.map((s) => (
              <View key={s.id} style={styles.row}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {s.productTitle}
                  {s.quantity > 1 ? ` ×${s.quantity}` : ""}
                  {s.status === "REFUNDED" && <Text style={styles.refundedTag}>  REFUNDED</Text>}
                  {s.isGift && <Text style={styles.rowType}>  GIFT</Text>}
                </Text>
                <Text style={styles.rowMeta}>
                  Bought by{" "}
                  <Text style={styles.buyerLink} onPress={() => navigation.navigate("Creator", { handle: s.buyer.handle })}>
                    {s.buyer.displayName} @{s.buyer.handle}
                  </Text>{" "}
                  · {new Date(s.createdAt).toLocaleString("en-NG")}
                </Text>
                {s.plays !== null && s.status !== "REFUNDED" && (
                  <Text style={styles.rowMeta}>
                    {s.plays} play{s.plays === 1 ? "" : "s"}
                    {s.downloadedOfflineAt ? ` · Saved offline ${shortDate(s.downloadedOfflineAt)}` : ""}
                    {s.downloadedFileAt ? ` · Downloaded file ${shortDate(s.downloadedFileAt)}` : ""}
                    {!s.downloadedOfflineAt && !s.downloadedFileAt ? " · Not downloaded" : ""}
                  </Text>
                )}
                {s.isGift && s.giftStatus && (
                  <Text style={styles.rowMeta}>
                    Gift{" "}
                    {s.giftStatus === "CLAIMED"
                      ? `claimed${s.giftClaimedByHandle ? ` by @${s.giftClaimedByHandle}` : ""}`
                      : s.giftStatus === "PENDING"
                        ? `unclaimed, expires ${s.giftExpiresAt ? new Date(s.giftExpiresAt).toLocaleString("en-NG") : "—"}`
                        : s.giftStatus.toLowerCase()}
                  </Text>
                )}
                {s.refundReason && <Text style={[styles.rowMeta, { color: colors.redSoft }]}>{s.refundReason}</Text>}
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  intro: { color: colors.ink3, fontSize: 12, marginBottom: 20 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  statBox: { width: "47%", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 12, padding: 12, alignItems: "center" },
  statValue: { color: colors.ink, fontSize: 22, fontFamily: fonts.serif },
  statLabel: { color: colors.ink3, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 2 },
  statNote: { color: colors.redSoft, fontSize: 11, marginTop: 2 },
  sectionTitle: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10 },
  emptyText: { color: colors.ink3, fontSize: 13 },
  list: {},
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  rowType: { color: colors.ink3, fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 1 },
  rowSold: { color: colors.ink, fontSize: 18, fontFamily: fonts.serif, marginLeft: 12 },
  rowMeta: { color: colors.ink3, fontSize: 12, marginTop: 4 },
  buyerStats: { flexDirection: "row", gap: 12, marginBottom: 8 },
  buyerStat: { flex: 1 },
  buyerStatLabel: { color: colors.ink3, fontSize: 11 },
  buyerStatValue: { color: colors.ink, fontSize: 15, fontWeight: "600", marginTop: 2 },
  refundedTag: { color: colors.redSoft, fontSize: 10.5, letterSpacing: 0.5 },
  buyerLink: { color: colors.ink2, fontWeight: "600" },
});
