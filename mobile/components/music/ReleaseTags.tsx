import { useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../lib/AuthContext";
import { API_BASE_URL } from "../../lib/api";
import type { RootStackParamList } from "../../lib/navigation";
import { MOODS, genreLabel, moodLabel } from "../../lib/musicTags";
import { colors } from "../../lib/theme";
import { TagPicker } from "./TagPicker";

// Mirrors web's components/music/ReleaseTags.tsx: a release's genres/moods
// as chips that open the Music tab filtered to them, plus an editor for the
// artist ("Add genre & mood" on releases from before genres existed).
export function ReleaseTags({
  productId,
  creatorId,
  initialGenres,
  initialMoods,
}: {
  productId: string;
  creatorId: string;
  initialGenres: string[];
  initialMoods: string[];
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { firebaseUser, appUser } = useAuth();
  const [genres, setGenres] = useState(initialGenres);
  const [moods, setMoods] = useState(initialMoods);
  const [editing, setEditing] = useState(false);
  const [draftGenres, setDraftGenres] = useState(initialGenres);
  const [draftMoods, setDraftMoods] = useState(initialMoods);
  const [saving, setSaving] = useState(false);
  const isCreator = appUser?.id === creatorId;

  function startEditing() {
    setDraftGenres(genres);
    setDraftMoods(moods);
    setEditing(true);
  }

  async function save() {
    if (!firebaseUser) return;
    if (draftGenres.length === 0) return Alert.alert("Pick a genre", "Choose at least one genre.");
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/releases/${productId}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await firebaseUser.getIdToken()}` },
        body: JSON.stringify({ genres: draftGenres, moods: draftMoods }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not save");
      setGenres(data.genres);
      setMoods(data.moods);
      setEditing(false);
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <View style={styles.editor}>
        <TagPicker genres={draftGenres} moods={draftMoods} onGenres={setDraftGenres} onMoods={setDraftMoods} />
        <View style={styles.buttons}>
          <TouchableOpacity style={styles.save} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.saveText}>Save</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancel} onPress={() => setEditing(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (genres.length === 0 && moods.length === 0) {
    if (!isCreator) return null;
    return (
      <TouchableOpacity style={styles.prompt} onPress={startEditing}>
        <Text style={styles.promptText}>
          <Text style={styles.promptStrong}>+ Add genre & mood</Text> — so fans can find this in the Music tab.
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.chips}>
      {genres.map((g) => (
        <TouchableOpacity key={g} style={styles.chip} onPress={() => navigation.navigate("DiscoverCategory", { type: "RELEASE", genre: g })}>
          <Text style={styles.chipText}>{genreLabel(g)}</Text>
        </TouchableOpacity>
      ))}
      {moods.map((m) => (
        <TouchableOpacity key={m} style={styles.chip} onPress={() => navigation.navigate("DiscoverCategory", { type: "RELEASE", mood: m })}>
          <Text style={styles.chipText}>
            {MOODS.find((x) => x.slug === m)?.icon} {moodLabel(m)}
          </Text>
        </TouchableOpacity>
      ))}
      {isCreator && (
        <TouchableOpacity onPress={startEditing} hitSlop={8}>
          <Text style={styles.edit}>Edit</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 16 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: colors.ink2, fontSize: 11, fontWeight: "600" },
  edit: { color: colors.redSoft, fontSize: 11, fontWeight: "600", marginLeft: 4 },
  prompt: { borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(225,29,46,0.6)", borderRadius: 12, padding: 12, marginBottom: 16 },
  promptText: { color: colors.ink2, fontSize: 12 },
  promptStrong: { color: colors.redSoft, fontWeight: "700" },
  editor: { borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 12, padding: 12, gap: 12, marginBottom: 16, backgroundColor: colors.surface },
  buttons: { flexDirection: "row", gap: 8 },
  save: { flex: 1, backgroundColor: colors.red, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  saveText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  cancel: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16 },
  cancelText: { color: colors.ink2, fontSize: 14, fontWeight: "600" },
});
