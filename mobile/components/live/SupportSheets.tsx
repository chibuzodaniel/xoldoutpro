import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View, StyleSheet } from "react-native";
import { useAuth } from "../../lib/AuthContext";
import { apiGet } from "../../lib/api";
import { giftByType, type GiftType } from "../../lib/liveTypes";
import { colors, fonts } from "../../lib/theme";
import { BottomSheet, InitialsAvatar } from "./LiveBits";
import { GiftArt, XgCoin } from "./LiveIcons";

// Mirrors web's components/live/SupportSheets.tsx (explicit ask, 2026-10-04):
// the host's tappable "supporters" and "XG" chips, both reading
// GET /api/live/[id]/support and refreshing whenever `version` bumps.

type Supporter = {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  giftsCount: number;
  giftsXg: number;
  accessXg: number;
  requestsCount: number;
  requestsXg: number;
  totalXg: number;
  kobo: number;
};

type SourceTotals = { xg: number; kobo: number; count: number };

export type LiveSupport = {
  totalXg: number;
  totalKobo: number;
  gifts: SourceTotals;
  access: SourceTotals;
  requests: SourceTotals;
  giftTypes: { type: string; count: number; xg: number }[];
  supporters: Supporter[];
};

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

function xg(n: number) {
  return `${n.toLocaleString("en-NG")} XG`;
}

export function useLiveSupport(liveId: string, open: boolean, version: number) {
  const { firebaseUser } = useAuth();
  const [data, setData] = useState<LiveSupport | null>(null);
  const load = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const idToken = await firebaseUser.getIdToken();
      setData(await apiGet<LiveSupport>(`/api/live/${liveId}/support`, idToken));
    } catch {
      // keep the last good data
    }
  }, [firebaseUser, liveId]);
  useEffect(() => {
    if (open) load();
  }, [open, version, load]);
  return data;
}

function what(s: Supporter) {
  const parts: string[] = [];
  if (s.giftsCount > 0) parts.push(`${s.giftsCount} gift${s.giftsCount === 1 ? "" : "s"}`);
  if (s.accessXg > 0) parts.push("paid to join");
  if (s.requestsCount > 0) parts.push(`${s.requestsCount} request${s.requestsCount === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function SupportersSheet({ data, visible, onClose }: { data: LiveSupport | null; visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Supporters</Text>
        {data && <Text style={styles.muted}>{data.supporters.length}</Text>}
      </View>
      {!data ? (
        <ActivityIndicator color={colors.ink} style={{ marginVertical: 24 }} />
      ) : data.supporters.length === 0 ? (
        <Text style={styles.empty}>No one has sent XG yet. Gifts, paid joins and requests show up here.</Text>
      ) : (
        <ScrollView style={{ maxHeight: 480 }}>
          {data.supporters.map((s, i) => (
            <View key={s.userId} style={styles.row}>
              <Text style={[styles.rank, i < 3 && { color: colors.amber }]}>{i + 1}</Text>
              <InitialsAvatar name={s.displayName || "?"} avatarUrl={s.avatarUrl} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {s.displayName}
                  {i === 0 ? " 👑" : ""}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {s.handle ? `@${s.handle} · ` : ""}
                  {what(s)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.xg}>{xg(s.totalXg)}</Text>
                <Text style={styles.naira}>{naira(s.kobo)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

function StatRow({ label, totals, unit }: { label: string; totals: SourceTotals; unit: string }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{label}</Text>
        <Text style={styles.muted}>
          {totals.count} {unit}
          {totals.count === 1 ? "" : "s"}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.xg}>{xg(totals.xg)}</Text>
        <Text style={styles.naira}>{naira(totals.kobo)}</Text>
      </View>
    </View>
  );
}

export function CoinStatsSheet({ data, visible, onClose }: { data: LiveSupport | null; visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.title, { marginBottom: 12 }]}>Coins received</Text>
      {!data ? (
        <ActivityIndicator color={colors.ink} style={{ marginVertical: 24 }} />
      ) : (
        <ScrollView style={{ maxHeight: 520 }}>
          <View style={styles.totalCard}>
            <View style={styles.totalRow}>
              <Text style={styles.cardLabel}>This stream</Text>
              <View style={styles.totalXgRow}>
                <XgCoin size={22} />
                <Text style={styles.totalXg}>{xg(data.totalXg)}</Text>
              </View>
            </View>
            <View style={[styles.totalRow, { marginTop: 4 }]}>
              <Text style={styles.muted}>
                From {data.supporters.length} supporter{data.supporters.length === 1 ? "" : "s"}
              </Text>
              <Text style={styles.totalNaira}>{naira(data.totalKobo)}</Text>
            </View>
          </View>

          <Text style={styles.section}>BY TYPE</Text>
          <StatRow label="Gifts" totals={data.gifts} unit="gift" />
          <StatRow label="Paid access" totals={data.access} unit="join" />
          <StatRow label="Paid requests" totals={data.requests} unit="request" />

          <Text style={styles.section}>GIFTS RECEIVED</Text>
          {data.giftTypes.length === 0 ? (
            <Text style={styles.empty}>No gifts yet.</Text>
          ) : (
            <View style={styles.giftGrid}>
              {data.giftTypes.map((g) => (
                <View key={g.type} style={styles.giftCell}>
                  <GiftArt type={g.type as GiftType} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {giftByType(g.type)?.label ?? g.type} ×{g.count}
                    </Text>
                    <Text style={styles.xg}>{xg(g.xg)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 },
  title: { color: colors.ink, fontSize: 24, fontFamily: fonts.serif },
  muted: { color: colors.ink3, fontSize: 12 },
  empty: { color: colors.ink3, fontSize: 13, paddingVertical: 16, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  rank: { width: 20, textAlign: "center", color: colors.ink3, fontSize: 13, fontWeight: "700" },
  name: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  xg: { color: colors.amber, fontSize: 14, fontWeight: "600" },
  naira: { color: colors.ink2, fontSize: 12 },
  totalCard: {
    borderWidth: 1,
    borderColor: "rgba(217,154,43,0.3)",
    backgroundColor: "rgba(217,154,43,0.05)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalXgRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardLabel: { color: colors.ink2, fontSize: 14 },
  totalXg: { color: colors.amber, fontSize: 22, fontWeight: "700" },
  totalNaira: { color: colors.ink, fontSize: 18, fontFamily: fonts.serif },
  section: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: 16, marginBottom: 4 },
  giftGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  giftCell: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
});
