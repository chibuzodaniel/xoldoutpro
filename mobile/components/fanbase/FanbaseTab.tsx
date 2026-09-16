import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import type { FanbaseGroup } from "../../lib/fanbaseTypes";
import type { RootStackParamList } from "../../lib/navigation";
import { colors } from "../../lib/theme";
import { FanbaseRow } from "./FanbaseRow";
import { CreateFanbaseSheet } from "./CreateFanbaseSheet";

export function FanbaseTab() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { appUser, firebaseUser } = useAuth();
  const [mine, setMine] = useState<FanbaseGroup[] | null>(null);
  const [discover, setDiscover] = useState<FanbaseGroup[] | null>(null);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [joining, setJoining] = useState<string | null>(null);

  async function load(q?: string) {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    const suffix = q ? `?q=${encodeURIComponent(q)}` : "";
    try {
      const [mineData, discoverData] = await Promise.all([
        apiGet<{ groups: FanbaseGroup[] }>(`/api/groups${suffix}`, idToken),
        apiGet<{ groups: FanbaseGroup[] }>(`/api/groups?discover=1${q ? `&q=${encodeURIComponent(q)}` : ""}`, idToken),
      ]);
      setMine(mineData.groups);
      setDiscover(discoverData.groups);
    } catch {
      setMine([]);
      setDiscover([]);
    }
  }

  useEffect(() => {
    load();
  }, [firebaseUser]);

  async function handleRequestJoin(groupId: string, visibility: "OPEN" | "REQUEST_TO_JOIN", groupName: string) {
    if (!firebaseUser) return;
    setJoining(groupId);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPost(`/api/groups/${groupId}/join`, idToken);
      if (visibility === "OPEN") {
        navigation.navigate("Group", { id: groupId, name: groupName });
      } else {
        setRequested((cur) => new Set(cur).add(groupId));
      }
    } catch {
      // best-effort
    } finally {
      setJoining(null);
    }
  }

  if (mine === null || discover === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  const owned = mine.filter((g) => g.creatorId === appUser?.id);
  const joined = mine.filter((g) => g.creatorId !== appUser?.id);
  const toDiscover = discover.filter((g) => !mine.some((m) => m.id === g.id));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.introText}>Private groups for your biggest fans — create your own, or request to join one.</Text>

      <TextInput
        style={styles.searchInput}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => load(query.trim() || undefined)}
        placeholder="Search Fanbase groups"
        placeholderTextColor={colors.ink3}
      />

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>MY FANBASE</Text>
        <TouchableOpacity onPress={() => setShowCreate(true)}>
          <Text style={styles.createText}>+ Create</Text>
        </TouchableOpacity>
      </View>
      {owned.length === 0 ? (
        <Text style={styles.emptyText}>You haven't started a Fanbase yet.</Text>
      ) : (
        owned.map((g, i) => (
          <FanbaseRow key={g.id} group={g} index={i} preview subtitle={`${g.memberCount} member${g.memberCount === 1 ? "" : "s"} · You own this`} />
        ))
      )}

      <Text style={[styles.sectionLabel, styles.sectionSpacing]}>JOINED</Text>
      {joined.length === 0 ? (
        <Text style={styles.emptyText}>Groups you join will show up here.</Text>
      ) : (
        joined.map((g, i) => <FanbaseRow key={g.id} group={g} index={i} preview subtitle={`${g.memberCount} member${g.memberCount === 1 ? "" : "s"}`} />)
      )}

      <Text style={[styles.sectionLabel, styles.sectionSpacing]}>DISCOVER</Text>
      {toDiscover.length === 0 ? (
        <Text style={styles.emptyText}>Nothing to discover yet.</Text>
      ) : (
        toDiscover.map((g, i) => (
          <FanbaseRow
            key={g.id}
            group={g}
            index={i}
            subtitle={`${g.memberCount} member${g.memberCount === 1 ? "" : "s"} · ${g.visibility === "REQUEST_TO_JOIN" ? "private circle" : "open"}`}
            action={
              requested.has(g.id) || g.joinRequestPending ? (
                <Text style={styles.requestedText}>Requested</Text>
              ) : (
                <TouchableOpacity
                  style={styles.joinButton}
                  onPress={() => handleRequestJoin(g.id, g.visibility, g.name)}
                  disabled={joining === g.id}
                >
                  <Text style={styles.joinButtonText}>{g.visibility === "OPEN" ? "Join" : "Request to Join"}</Text>
                </TouchableOpacity>
              )
            }
          />
        ))
      )}

      <CreateFanbaseSheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(groupId, groupName) => {
          setShowCreate(false);
          navigation.navigate("Group", { id: groupId, name: groupName });
        }}
      />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  introText: { color: colors.ink3, fontSize: 12, marginBottom: 16 },
  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
    marginBottom: 20,
  },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  sectionLabel: { color: colors.ink3, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginBottom: 4 },
  sectionSpacing: { marginTop: 20 },
  createText: { color: colors.redSoft, fontSize: 12, fontWeight: "700" },
  emptyText: { color: colors.ink3, fontSize: 13, paddingVertical: 8 },
  requestedText: { color: colors.ink3, fontSize: 12 },
  joinButton: { borderWidth: 1, borderColor: colors.red, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  joinButtonText: { color: colors.redSoft, fontSize: 12, fontWeight: "700" },
});
