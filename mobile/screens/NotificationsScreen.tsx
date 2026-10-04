import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Linking, SafeAreaView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../lib/navigation";
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
  MODERATION: "Needs moderator attention",
  FOLLOW: "New follower",
  LIKE: "Like",
  COMMENT: "Comment",
  FANBASE: "Fanbase",
  REMINDER: "Reminder",
  VERIFICATION: "Verification",
  LIVE: "Live",
};

const KIND_COLOR: Record<NotificationKind, string> = {
  SALE: colors.green,
  ORDER_PAID: colors.green,
  PAYOUT_INITIATED: colors.blue,
  PAYOUT_PAID: colors.green,
  PAYOUT_FAILED: colors.redSoft,
  REFUND: colors.amber,
  MODERATION: colors.redSoft,
  FOLLOW: colors.blue,
  LIKE: colors.redSoft,
  COMMENT: colors.blue,
  FANBASE: colors.amber,
  REMINDER: colors.amber,
  VERIFICATION: colors.green,
  LIVE: colors.redSoft,
};

// Mirrors web's NotificationsSheet (explicit ask, 2026-10-04): notifications
// with the same kind and title merge into one row with a count; tapping it
// expands the individual notifications, and tapping one of those goes
// straight to that notification's own page. A group of one is unchanged.
type NotificationGroup = { key: string; items: NotificationRow[] };

function groupNotifications(rows: NotificationRow[]): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  for (const n of rows) {
    const key = `${n.kind}|${n.title}`;
    const group = groups.get(key);
    if (group) group.items.push(n);
    else groups.set(key, { key, items: [n] });
  }
  // rows arrive newest-first, so Map insertion order is already "by newest item".
  return [...groups.values()];
}

// "Join live" while it's running, "Live ended" once it's over (explicit ask,
// 2026-10-04).
function LivePill({ status }: { status?: NotificationRow["liveStatus"] }) {
  if (!status) return null;
  const style = status === "LIVE" ? styles.pillLive : status === "SCHEDULED" ? styles.pillUpcoming : styles.pillEnded;
  const textStyle = status === "LIVE" ? styles.pillLiveText : status === "SCHEDULED" ? styles.pillUpcomingText : styles.pillEndedText;
  const label = status === "LIVE" ? "● Join live" : status === "SCHEDULED" ? "Upcoming" : "Live ended";
  return (
    <View style={[styles.pill, style]}>
      <Text style={textStyle}>{label}</Text>
    </View>
  );
}

export function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [selected, setSelected] = useState<NotificationRow | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Expanding a merged group counts as viewing everything in it (explicit
  // ask, 2026-10-04) — its "N new" count goes away.
  function toggleGroup(key: string, items: NotificationRow[]) {
    const opening = !expanded.has(key);
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (opening) markRead(items.filter((i) => !i.readAt).map((i) => i.id));
  }

  // Join-request notifications open the in-app pending list and Live
  // notifications open the Live itself; everything else still opens its
  // page on the website.
  function openUrl(url: string) {
    const liveId = url.match(/^\/live\/([^/?#]+)$/)?.[1];
    if (url === "/groups/requests") navigation.navigate("FanbaseRequests");
    else if (liveId) navigation.navigate("LiveViewer", { id: liveId });
    else Linking.openURL(`${API_BASE_URL}${url}`);
  }

  // Explicit ask, 2026-10-04: a notification only counts as checked once
  // the user actually opens it — not just because this screen was opened.
  // Updated locally at once so it dims immediately; null = mark all.
  function markRead(ids: string[] | null) {
    const now = new Date().toISOString();
    const pending = (notifications ?? []).filter((n) => !n.readAt && (ids === null || ids.includes(n.id)));
    if (pending.length === 0 || !firebaseUser) return;
    setNotifications((cur) => cur?.map((n) => (pending.some((p) => p.id === n.id) ? { ...n, readAt: now } : n)) ?? null);
    firebaseUser
      .getIdToken()
      .then((idToken) => apiPost("/api/notifications/read", idToken, ids === null ? {} : { ids: pending.map((n) => n.id) }))
      .catch(() => {});
  }

  function openDetail(n: NotificationRow) {
    markRead([n.id]);
    setSelected(n);
  }

  // A merged notification's own row: straight to its page when it has one.
  function openItem(n: NotificationRow) {
    markRead([n.id]);
    if (n.url) openUrl(n.url);
    else setSelected(n);
  }

  const unreadTotal = notifications?.filter((n) => !n.readAt).length ?? 0;

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser.getIdToken().then(async (idToken) => {
      try {
        const data = await apiGet<{ notifications: NotificationRow[] }>("/api/notifications", idToken);
        setNotifications(data.notifications);
      } catch {
        setNotifications([]);
      }
      // Opening this screen marks everything seen — the bell badge clears —
      // without marking anything read (explicit ask, 2026-10-04).
      apiPost("/api/notifications/seen", idToken).catch(() => {});
    });
  }, [firebaseUser]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        <View style={styles.headerActions}>
          {unreadTotal > 0 && (
            <TouchableOpacity onPress={() => markRead(null)}>
              <Text style={styles.markAllText}>Mark all as read</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
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
          data={groupNotifications(notifications)}
          keyExtractor={(g) => g.key}
          extraData={{ expanded, notifications }}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item: group }) => {
            const item = group.items[0];
            const merged = group.items.length > 1;
            const isOpen = merged && expanded.has(group.key);
            const unreadInGroup = group.items.filter((n) => !n.readAt).length;
            const isUnread = unreadInGroup > 0;
            return (
              <View style={isUnread ? styles.unreadGroup : undefined}>
                <TouchableOpacity
                  style={[styles.row, !isUnread && styles.readRow]}
                  onPress={() => (merged ? toggleGroup(group.key, group.items) : openDetail(item))}
                >
                  <View style={[styles.unreadDot, !isUnread && styles.dotHidden]} />
                  <View style={[styles.kindBadge, { backgroundColor: `${KIND_COLOR[item.kind]}26` }]}>
                    <View style={[styles.kindDot, { backgroundColor: KIND_COLOR[item.kind] }]} />
                    {merged && (
                      <View style={styles.countBadge}>
                        <Text style={styles.countText}>{group.items.length}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.rowTitle, !isUnread && styles.readTitle]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.rowBody} numberOfLines={1}>
                      {item.body}
                      {merged && (
                        <Text style={styles.moreText}>
                          {" "}
                          · +{group.items.length - 1} more{isUnread ? ` · ${unreadInGroup} new` : ""}
                        </Text>
                      )}
                    </Text>
                    <LivePill status={item.liveStatus} />
                  </View>
                  <Text style={styles.rowTime}>
                    {timeAgo(item.createdAt)}
                    {merged ? (isOpen ? "  ▴" : "  ▾") : ""}
                  </Text>
                </TouchableOpacity>
                {isOpen && (
                  <View style={styles.subList}>
                    {group.items.map((n) => (
                      <TouchableOpacity key={n.id} style={[styles.subRow, n.readAt ? styles.readRow : null]} onPress={() => openItem(n)}>
                        <View style={[styles.subDot, n.readAt ? styles.dotHidden : null]} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.subBody, !n.readAt && styles.subBodyUnread]}>{n.body}</Text>
                          <LivePill status={n.liveStatus} />
                        </View>
                        <Text style={styles.rowTime}>{timeAgo(n.createdAt)}</Text>
                        {n.url ? <Text style={styles.chevron}>›</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          }}
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
                  if (selected.url) openUrl(selected.url);
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
  pill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  pillLive: { backgroundColor: colors.red },
  pillLiveText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  pillUpcoming: { backgroundColor: "rgba(217,154,43,0.15)" },
  pillUpcomingText: { color: colors.amber, fontSize: 11, fontWeight: "600" },
  pillEnded: { backgroundColor: "rgba(255,255,255,0.1)" },
  pillEndedText: { color: colors.ink3, fontSize: 11, fontWeight: "600" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  markAllText: { color: colors.redSoft, fontSize: 13, fontWeight: "600" },
  unreadGroup: { backgroundColor: "rgba(225,29,46,0.06)", marginHorizontal: -16, paddingHorizontal: 16 },
  readRow: { opacity: 0.6 },
  readTitle: { color: colors.ink2, fontWeight: "500" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
  subDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.red },
  dotHidden: { backgroundColor: "transparent" },
  subBodyUnread: { color: colors.ink, fontWeight: "500" },
  countBadge: {
    position: "absolute",
    top: -5,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  moreText: { color: colors.ink2 },
  subList: { marginLeft: 42, marginBottom: 8, borderLeftWidth: 1, borderLeftColor: colors.lineSoft },
  subRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingLeft: 12 },
  subBody: { flex: 1, color: colors.ink2, fontSize: 12 },
  chevron: { color: colors.ink3, fontSize: 16 },
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
