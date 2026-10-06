import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, FlatList, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../lib/AuthContext";
import { apiGet } from "../lib/api";
import type { DmConversationRow, DmPerson } from "../lib/messageTypes";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { Avatar } from "../components/Avatar";

// Mirrors web's app/(app)/messages/page.tsx: Inbox / Requests and "New
// message" search. Refreshes on focus and every 10s while in view.

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

export function MessagesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();
  const isFocused = useIsFocused();
  const [tab, setTab] = useState<"inbox" | "requests">("inbox");
  const [rows, setRows] = useState<Record<"inbox" | "requests", DmConversationRow[] | null>>({ inbox: null, requests: null });
  const [composing, setComposing] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DmPerson[]>([]);

  useEffect(() => {
    navigation.setOptions({
      title: "Messages",
      headerRight: () => (
        <TouchableOpacity onPress={() => setComposing((v) => !v)} hitSlop={8}>
          <Text style={styles.headerAction}>{composing ? "Cancel" : "New"}</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, composing]);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const idToken = await firebaseUser.getIdToken();
      const [inbox, requests] = await Promise.all(
        (["inbox", "requests"] as const).map((box) =>
          apiGet<{ conversations: DmConversationRow[] }>(`/api/messages?box=${box}`, idToken).then((d) => d.conversations),
        ),
      );
      setRows({ inbox, requests });
    } catch {
      setRows((cur) => ({ inbox: cur.inbox ?? [], requests: cur.requests ?? [] }));
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (!isFocused) return;
    load();
    const id = setInterval(load, 20_000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") load();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [isFocused, load]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = setTimeout(() => {
      apiGet<{ creators: DmPerson[] }>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((d) => setResults(d.creators ?? []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  const list = rows[tab];
  const requestCount = rows.requests?.length ?? 0;

  return (
    <View style={styles.container}>
      {composing && (
        <View style={styles.compose}>
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search for someone to message"
            placeholderTextColor={colors.ink3}
            style={styles.search}
          />
          {query.trim().length >= 2 &&
            (results.length === 0 ? (
              <Text style={styles.empty}>No one found.</Text>
            ) : (
              results.map((p, i) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.personRow}
                  onPress={() => {
                    setComposing(false);
                    setQuery("");
                    navigation.navigate("Conversation", { toUserId: p.id });
                  }}
                >
                  <Avatar uri={p.avatarUrl} name={p.displayName} index={i} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {p.displayName}
                    </Text>
                    <Text style={styles.preview}>@{p.handle}</Text>
                  </View>
                </TouchableOpacity>
              ))
            ))}
        </View>
      )}

      <View style={styles.tabs}>
        {(["inbox", "requests"] as const).map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "inbox" ? "Inbox" : `Requests${requestCount ? ` (${requestCount})` : ""}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {list === null ? (
        <ActivityIndicator color={colors.ink} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={list.filter((c) => c.other)}
          keyExtractor={(c) => c.id}
          onRefresh={load}
          refreshing={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>{tab === "inbox" ? "No messages yet" : "No message requests"}</Text>
              <Text style={styles.empty}>
                {tab === "inbox" ? "Message someone from their profile, or tap New." : "Messages from people you don't follow show up here first."}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <TouchableOpacity style={styles.row} onPress={() => navigation.navigate("Conversation", { id: item.id })}>
              <Avatar uri={item.other!.avatarUrl} name={item.other!.displayName} index={index} size={48} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.name, item.unread > 0 && styles.unreadName]} numberOfLines={1}>
                  {item.other!.displayName}
                  {item.muted ? "  🔕" : ""}
                </Text>
                <Text style={[styles.preview, item.unread > 0 && styles.unreadPreview]} numberOfLines={1}>
                  {item.lastMessage ? `${item.lastMessage.fromMe ? "You: " : ""}${item.lastMessage.preview}` : "Say hello"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={styles.time}>{timeAgo(item.lastMessageAt)}</Text>
                {item.unread > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unread > 99 ? "99+" : item.unread}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerAction: { color: colors.redSoft, fontSize: 14, fontWeight: "700" },
  compose: { paddingHorizontal: 16, paddingTop: 12 },
  search: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
    marginBottom: 6,
  },
  personRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  tabs: { flexDirection: "row", gap: 20, paddingHorizontal: 16, marginTop: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  tab: { paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: colors.red },
  tabText: { color: colors.ink3, fontSize: 14, fontWeight: "600" },
  tabTextActive: { color: colors.ink },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  name: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  unreadName: { fontWeight: "800" },
  preview: { color: colors.ink3, fontSize: 13, marginTop: 2 },
  unreadPreview: { color: colors.ink, fontWeight: "600" },
  time: { color: colors.ink3, fontSize: 11 },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.red, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  emptyWrap: { paddingVertical: 60, alignItems: "center" },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: "600", marginBottom: 4 },
  empty: { color: colors.ink3, fontSize: 13, textAlign: "center", paddingVertical: 6 },
});
