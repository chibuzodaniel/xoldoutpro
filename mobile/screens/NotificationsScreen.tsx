import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Linking, SafeAreaView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { API_BASE_URL, apiGet, apiPost } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import type { NotificationKind, NotificationRow } from "../lib/notificationTypes";
import { colors, fonts } from "../lib/theme";

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const KIND_LABEL: Record<NotificationKind, string> = {
  SALE: "Sale",
  ORDER_PAID: "Order confirmed",
  PAYOUT_INITIATED: "Withdrawal started",
  PAYOUT_PAID: "Withdrawal sent",
  PAYOUT_FAILED: "Withdrawal failed",
  REFUND: "Refund",
};

const KIND_COLOR: Record<NotificationKind, string> = {
  SALE: colors.green,
  ORDER_PAID: colors.green,
  PAYOUT_INITIATED: colors.blue,
  PAYOUT_PAID: colors.green,
  PAYOUT_FAILED: colors.redSoft,
  REFUND: colors.amber,
};

export function NotificationsScreen() {
  const navigation = useNavigation();
  const { firebaseUser } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [selected, setSelected] = useState<NotificationRow | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser.getIdToken().then(async (idToken) => {
      try {
        const data = await apiGet<{ notifications: NotificationRow[] }>("/api/notifications", idToken);
        setNotifications(data.notifications);
      } catch {
        setNotifications([]);
      }
      apiPost("/api/notifications/read", idToken).catch(() => {});
    });
  }, [firebaseUser]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      {notifications === null ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Sales, orders, payouts, and refunds show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => setSelected(item)}>
              <View style={[styles.kindBadge, { backgroundColor: `${KIND_COLOR[item.kind]}26` }]}>
                <View style={[styles.kindDot, { backgroundColor: KIND_COLOR[item.kind] }]} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.rowBody} numberOfLines={1}>
                  {item.body}
                </Text>
              </View>
              <Text style={styles.rowTime}>{timeAgo(item.createdAt)}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {selected && (
        <View style={styles.detailOverlay}>
          <TouchableOpacity style={styles.detailBackdrop} activeOpacity={1} onPress={() => setSelected(null)} />
          <View style={styles.detailSheet}>
            <View style={styles.detailHeader}>
              <View style={[styles.kindBadge, styles.kindBadgeLarge, { backgroundColor: `${KIND_COLOR[selected.kind]}26` }]}>
                <View style={[styles.kindDot, { backgroundColor: KIND_COLOR[selected.kind] }]} />
              </View>
              <View>
                <Text style={styles.detailKind}>{KIND_LABEL[selected.kind]}</Text>
                <Text style={styles.detailDate}>{fullDate(selected.createdAt)}</Text>
              </View>
            </View>
            <Text style={styles.detailTitle}>{selected.title}</Text>
            <Text style={styles.detailBody}>{selected.body}</Text>

            {selected.url && (
              <TouchableOpacity
                style={styles.viewButton}
                onPress={() => {
                  Linking.openURL(`${API_BASE_URL}${selected.url}`);
                  setSelected(null);
                }}
              >
                <Text style={styles.viewButtonText}>View</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.closeButton} onPress={() => setSelected(null)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, marginBottom: 8 },
  title: { color: colors.ink, fontSize: 22, fontFamily: fonts.serif },
  closeText: { color: colors.ink2, fontSize: 14 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  emptyText: { color: colors.ink3, fontSize: 13, textAlign: "center" },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  separator: { height: 1, backgroundColor: colors.lineSoft },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  kindBadge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  kindBadgeLarge: { width: 40, height: 40, borderRadius: 20 },
  kindDot: { width: 8, height: 8, borderRadius: 4 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  rowBody: { color: colors.ink3, fontSize: 12, marginTop: 1 },
  rowTime: { color: colors.ink3, fontSize: 11 },
  detailOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end" },
  detailBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)" },
  detailSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 32 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  detailKind: { color: colors.ink3, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  detailDate: { color: colors.ink3, fontSize: 12, marginTop: 2 },
  detailTitle: { color: colors.ink, fontSize: 18, fontFamily: fonts.serif, marginBottom: 8 },
  detailBody: { color: colors.ink2, fontSize: 14, lineHeight: 20, marginBottom: 20 },
  viewButton: { backgroundColor: colors.red, borderRadius: 8, paddingVertical: 12, alignItems: "center", marginBottom: 8 },
  viewButtonText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  closeButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  closeButtonText: { color: colors.ink2, fontSize: 14, fontWeight: "600" },
});
