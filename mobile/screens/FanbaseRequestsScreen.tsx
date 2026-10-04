import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiGet, apiPatch } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { Avatar } from "../components/Avatar";
import { useToast } from "../components/ToastProvider";

// Mirrors web's app/(app)/groups/requests/page.tsx: every pending join request
// across the private Fanbases this user runs, grouped by Fanbase. Opened from
// the Profile "Private Fanbase join requests" row and from the new-request
// notification (explicit ask, 2026-10-04).

type PendingRequest = {
  id: string;
  createdAt: string;
  user: { id: string; handle: string; displayName: string; avatarUrl: string | null };
  group: { id: string; name: string; coverImageUrl: string | null };
};

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function FanbaseRequestsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();
  const toast = useToast();
  const [requests, setRequests] = useState<PendingRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: "Join requests" });
  }, [navigation]);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const idToken = await firebaseUser.getIdToken();
      const data = await apiGet<{ requests: PendingRequest[] }>("/api/groups/join-requests", idToken);
      setRequests(data.requests);
    } catch {
      setRequests([]);
    }
  }, [firebaseUser]);

  useEffect(() => {
    load();
  }, [load]);

  async function respond(r: PendingRequest, action: "approve" | "reject") {
    if (!firebaseUser) return;
    setBusyId(r.id);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPatch(`/api/groups/${r.group.id}/join-requests/${r.id}`, idToken, { action });
      setRequests((cur) => cur?.filter((x) => x.id !== r.id) ?? null);
      toast.success(action === "approve" ? `${r.user.displayName} joined ${r.group.name}.` : `Declined ${r.user.displayName}.`);
    } catch (err) {
      // 409 = another admin already handled it — it's no longer pending either way.
      if (err instanceof Error && err.message.endsWith("409")) {
        setRequests((cur) => cur?.filter((x) => x.id !== r.id) ?? null);
      } else {
        toast.error("Couldn't update that request. Try again.");
      }
    } finally {
      setBusyId(null);
    }
  }

  if (requests === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (requests.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Nothing pending</Text>
        <Text style={styles.emptyBody}>When someone asks to join one of your private Fanbases, they'll show up here.</Text>
      </View>
    );
  }

  const byGroup = new Map<string, { group: PendingRequest["group"]; requests: PendingRequest[] }>();
  for (const r of requests) {
    const entry = byGroup.get(r.group.id) ?? { group: r.group, requests: [] };
    entry.requests.push(r);
    byGroup.set(r.group.id, entry);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {[...byGroup.values()].map(({ group, requests: list }) => (
        <View key={group.id} style={styles.section}>
          <TouchableOpacity style={styles.sectionHeader} onPress={() => navigation.navigate("Group", { id: group.id, name: group.name })}>
            <Text style={styles.sectionLabel} numberOfLines={1}>
              {group.name.toUpperCase()}
            </Text>
            <Text style={styles.pendingCount}>{list.length} pending</Text>
          </TouchableOpacity>
          {list.map((r, i) => (
            <View key={r.id} style={styles.row}>
              <TouchableOpacity style={styles.person} onPress={() => navigation.navigate("Creator", { handle: r.user.handle })}>
                <Avatar uri={r.user.avatarUrl} name={r.user.displayName} index={i} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.user.displayName}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    @{r.user.handle} · {timeAgo(r.createdAt)}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.declineButton} disabled={busyId === r.id} onPress={() => respond(r, "reject")}>
                <Text style={styles.declineText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.approveButton} disabled={busyId === r.id} onPress={() => respond(r, "approve")}>
                <Text style={styles.approveText}>Approve</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, paddingHorizontal: 32 },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  emptyBody: { color: colors.ink3, fontSize: 12, marginTop: 4, textAlign: "center" },
  section: { marginBottom: 28 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 12 },
  sectionLabel: { flex: 1, color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  pendingCount: { color: colors.ink3, fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  person: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  name: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  meta: { color: colors.ink3, fontSize: 12 },
  declineButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  declineText: { color: colors.ink2, fontSize: 12, fontWeight: "600" },
  approveButton: { backgroundColor: colors.red, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  approveText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
});
