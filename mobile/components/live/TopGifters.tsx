import { useCallback, useEffect, useState } from "react";
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useAuth } from "../../lib/AuthContext";
import { apiGet } from "../../lib/api";
import { colors, fonts } from "../../lib/theme";
import { BottomSheet, InitialsAvatar } from "./LiveBits";
import { XgCoin } from "./LiveIcons";

// Mirrors web's components/live/TopGifters.tsx (explicit ask, 2026-10-04:
// "the live viewer should see the top gifter") — a crowned chip under the
// header and the top 5 when tapped. Gift XG only.

export type TopGifter = {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  xg: number;
  giftsCount: number;
};

export function useTopGifters(liveId: string, version: number) {
  const { firebaseUser } = useAuth();
  const [gifters, setGifters] = useState<TopGifter[]>([]);
  const load = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const idToken = await firebaseUser.getIdToken();
      setGifters((await apiGet<{ gifters: TopGifter[] }>(`/api/live/${liveId}/top-gifters`, idToken)).gifters);
    } catch {
      // keep the last good list
    }
  }, [firebaseUser, liveId]);
  useEffect(() => {
    load();
  }, [version, load]);
  return gifters;
}

export function TopGifterChip({ top, selfId, onOpen }: { top: TopGifter | undefined; selfId: string; onOpen: () => void }) {
  if (!top) return null;
  return (
    <TouchableOpacity style={styles.chip} onPress={onOpen} accessibilityLabel="See the top gifters">
      <InitialsAvatar name={top.displayName || "?"} avatarUrl={top.avatarUrl} size={24} />
      <Text style={styles.crown}>👑</Text>
      <Text style={styles.chipName} numberOfLines={1}>
        {top.userId === selfId ? "You" : top.displayName}
      </Text>
      <Text style={styles.chipXg}>{top.xg.toLocaleString("en-NG")} XG</Text>
    </TouchableOpacity>
  );
}

export function TopGiftersSheet({ gifters, selfId, visible, onClose }: { gifters: TopGifter[]; selfId: string; visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Top gifters</Text>
      {gifters.length === 0 ? (
        <Text style={styles.empty}>No gifts yet — be the first.</Text>
      ) : (
        gifters.map((g, i) => (
          <View key={g.userId} style={[styles.row, g.userId === selfId && styles.rowSelf]}>
            <Text style={[styles.rank, i === 0 && { color: colors.amber }]}>{i === 0 ? "👑" : i + 1}</Text>
            <InitialsAvatar name={g.displayName || "?"} avatarUrl={g.avatarUrl} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={1}>
                {g.userId === selfId ? "You" : g.displayName}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {g.handle ? `@${g.handle} · ` : ""}
                {g.giftsCount} gift{g.giftsCount === 1 ? "" : "s"}
              </Text>
            </View>
            <View style={styles.xgRow}>
              <XgCoin size={16} />
              <Text style={styles.xg}>{g.xg.toLocaleString("en-NG")}</Text>
            </View>
          </View>
        ))
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    maxWidth: "75%",
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(217,154,43,0.4)",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 999,
    paddingVertical: 2,
    paddingLeft: 2,
    paddingRight: 12,
  },
  crown: { fontSize: 12 },
  chipName: { flexShrink: 1, color: "#fff", fontSize: 13, fontWeight: "600" },
  chipXg: { color: colors.amber, fontSize: 12, fontWeight: "600" },
  title: { color: colors.ink, fontSize: 24, fontFamily: fonts.serif, marginBottom: 12 },
  empty: { color: colors.ink3, fontSize: 13, textAlign: "center", paddingVertical: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  rowSelf: { backgroundColor: "rgba(217,154,43,0.1)", borderRadius: 12, paddingHorizontal: 8 },
  rank: { width: 22, textAlign: "center", color: colors.ink3, fontSize: 14, fontWeight: "700" },
  name: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  meta: { color: colors.ink3, fontSize: 12 },
  xgRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  xg: { color: colors.amber, fontSize: 14, fontWeight: "600" },
});
