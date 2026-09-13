import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { apiDelete, apiGet, apiPatch } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import type { GroupMember, JoinRequestRow } from "../lib/fanbaseTypes";
import type { RootStackParamList } from "../lib/navigation";
import { colors, fonts } from "../lib/theme";
import { Avatar } from "../components/Avatar";
import { ActionSheet } from "../components/ActionSheet";

export function GroupMembersScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "GroupMembers">>();
  const { id, isCreator } = route.params;
  const { firebaseUser } = useAuth();

  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [requests, setRequests] = useState<JoinRequestRow[] | null>(null);
  const [actionsForMember, setActionsForMember] = useState<GroupMember | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    try {
      const [membersData, requestsData] = await Promise.all([
        apiGet<{ members: GroupMember[] }>(`/api/groups/${id}/members`, idToken),
        apiGet<{ requests: JoinRequestRow[] }>(`/api/groups/${id}/join-requests`, idToken),
      ]);
      setMembers(membersData.members);
      setRequests(requestsData.requests);
    } catch {
      setMembers([]);
      setRequests([]);
    }
  }, [firebaseUser, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRequestAction(requestId: string, action: "approve" | "reject") {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    try {
      await apiPatch(`/api/groups/${id}/join-requests/${requestId}`, idToken, { action });
      await load();
    } catch {
      // ignore
    }
  }

  async function handleSetRole(userId: string, role: "ADMIN" | "MEMBER") {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    try {
      await apiPatch(`/api/groups/${id}/members/${userId}`, idToken, { role });
      await load();
    } catch {
      // ignore
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    try {
      await apiDelete(`/api/groups/${id}/members/${userId}`, idToken);
      await load();
    } catch {
      // ignore
    }
  }

  if (members === null || requests === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Manage Fanbase</Text>

      {requests.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PENDING REQUESTS</Text>
          {requests.map((r) => (
            <View key={r.id} style={styles.requestRow}>
              <Avatar uri={r.user.avatarUrl} name={r.user.displayName} index={0} size={36} />
              <Text style={styles.memberName} numberOfLines={1}>
                {r.user.displayName}
              </Text>
              <TouchableOpacity style={styles.approveButton} onPress={() => handleRequestAction(r.id, "approve")}>
                <Text style={styles.approveText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleRequestAction(r.id, "reject")}>
                <Text style={styles.rejectText}>Deny</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>MEMBERS · {members.length}</Text>
        {members.map((m) => (
          <TouchableOpacity
            key={m.user.id}
            style={styles.memberRow}
            onLongPress={() => setActionsForMember(m)}
            disabled={!isCreator}
          >
            <Avatar uri={m.user.avatarUrl} name={m.user.displayName} index={0} size={36} />
            <Text style={styles.memberName} numberOfLines={1}>
              {m.user.displayName}
            </Text>
            <Text style={styles.roleText}>{m.role === "ADMIN" ? "Admin" : "Member"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {actionsForMember && (
        <ActionSheet
          visible
          title={actionsForMember.user.displayName}
          onClose={() => setActionsForMember(null)}
          actions={[
            {
              label: actionsForMember.role === "ADMIN" ? "Remove as admin" : "Make admin",
              onPress: () => handleSetRole(actionsForMember.user.id, actionsForMember.role === "ADMIN" ? "MEMBER" : "ADMIN"),
            },
            { label: "Remove from group", destructive: true, onPress: () => handleRemoveMember(actionsForMember.user.id) },
          ]}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  content: { padding: 16, paddingTop: 50, paddingBottom: 40 },
  pageTitle: { color: colors.ink, fontSize: 22, fontFamily: fonts.serif, marginBottom: 20 },
  section: { marginBottom: 24 },
  sectionLabel: { color: colors.ink3, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginBottom: 10 },
  requestRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  memberName: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: "500" },
  roleText: { color: colors.ink3, fontSize: 12 },
  approveButton: { backgroundColor: colors.red, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, marginRight: 10 },
  approveText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  rejectText: { color: colors.ink3, fontSize: 11, fontWeight: "700" },
});
