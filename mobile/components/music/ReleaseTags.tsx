import { useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../lib/AuthContext";
import { API_BASE_URL } from "../../lib/api";
import type { RootStackParamList } from "../../lib/navigation";
import { genreLabel } from "../../lib/musicTags";
import { EDIT_WINDOW_HOURS, isWithinEditWindow } from "../../lib/editWindow";
import { colors } from "../../lib/theme";
import { SquareImagePicker } from "../creator/SquareImagePicker";
import { PriceField } from "../creator/PriceField";
import { TagPicker } from "./TagPicker";

// Mirrors web's components/music/ReleaseTags.tsx: genre chips that open the
// Music tab, plus the artist's "Edit release" — a general editor (explicit
// ask, 2026-11-04) for cover, name, price, description and genres, saved in
// one PATCH /api/releases/[id]. Everything but genres follows the edit
// window (lib/editWindow.ts); genres stay editable any time.
export function ReleaseTags({
  productId,
  creatorId,
  initialGenres,
  title,
  description,
  priceKobo,
  publishedAt,
  onSaved,
}: {
  productId: string;
  creatorId: string;
  initialGenres: string[];
  title: string;
  description: string | null;
  priceKobo: number;
  publishedAt: string | null;
  onSaved?: () => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { firebaseUser, appUser } = useAuth();
  const [genres, setGenres] = useState(initialGenres);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftGenres, setDraftGenres] = useState(initialGenres);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDescription, setDraftDescription] = useState(description ?? "");
  const [isFree, setIsFree] = useState(priceKobo === 0);
  const [priceNaira, setPriceNaira] = useState(priceKobo ? String(priceKobo / 100) : "");
  const [newLadder, setNewLadder] = useState<Record<string, string> | null>(null);

  const isCreator = appUser?.id === creatorId;
  const windowOpen = isWithinEditWindow(publishedAt);

  function startEditing() {
    setDraftGenres(genres);
    setDraftTitle(title);
    setDraftDescription(description ?? "");
    setIsFree(priceKobo === 0);
    setPriceNaira(priceKobo ? String(priceKobo / 100) : "");
    setNewLadder(null);
    setEditing(true);
  }

  async function save() {
    if (!firebaseUser) return;
    if (draftGenres.length === 0) return Alert.alert("Pick a genre", "Choose at least one genre.");
    const body: Record<string, unknown> = {};
    if (JSON.stringify([...draftGenres].sort()) !== JSON.stringify([...genres].sort())) body.genres = draftGenres;
    if (windowOpen) {
      const nextTitle = draftTitle.trim();
      if (!nextTitle) return Alert.alert("Missing name", "Give the release a name.");
      const nextPrice = isFree ? 0 : Math.round(parseFloat(priceNaira || "0") * 100);
      if (!isFree && (Number.isNaN(nextPrice) || nextPrice <= 0)) return Alert.alert("Missing price", "Set a price, or mark this release free.");
      if (nextTitle !== title) body.title = nextTitle;
      if (draftDescription !== (description ?? "")) body.description = draftDescription;
      if (nextPrice !== priceKobo) body.priceKobo = nextPrice;
      if (newLadder) body.artworkLadder = newLadder;
    }
    if (Object.keys(body).length === 0) return setEditing(false);

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/releases/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await firebaseUser.getIdToken()}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not save");
      setGenres(data.product?.release?.genres ?? draftGenres);
      setEditing(false);
      onSaved?.();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <View style={styles.editor}>
        <Text style={styles.editorTitle}>EDIT RELEASE</Text>

        {windowOpen ? (
          <>
            <SquareImagePicker label="Cover" placeholder="Change cover" ladder={newLadder} onChange={setNewLadder} />
            {!newLadder && <Text style={styles.hint}>Leave empty to keep the current cover.</Text>}

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Name</Text>
              <TextInput style={styles.input} value={draftTitle} onChangeText={(t) => setDraftTitle(t.slice(0, 200))} placeholderTextColor={colors.ink3} />
            </View>

            <PriceField allowFree isFree={isFree} onFreeChange={setIsFree} priceNaira={priceNaira} onPriceChange={setPriceNaira} />

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
                value={draftDescription}
                onChangeText={(t) => setDraftDescription(t.slice(0, 2000))}
                multiline
              />
            </View>
          </>
        ) : (
          <Text style={styles.hint}>
            Name, price, cover and description can only be changed in the first {EDIT_WINDOW_HOURS} hours after release. You can still change the genre.
          </Text>
        )}

        <TagPicker genres={draftGenres} onGenres={setDraftGenres} />

        <View style={styles.buttons}>
          <TouchableOpacity style={styles.save} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.saveText}>Save changes</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancel} onPress={() => setEditing(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (genres.length === 0 && !isCreator) return null;

  return (
    <View style={styles.chips}>
      {genres.map((g) => (
        <TouchableOpacity key={g} style={styles.chip} onPress={() => navigation.navigate("DiscoverCategory", { type: "RELEASE", genre: g })}>
          <Text style={styles.chipText}>{genreLabel(g)}</Text>
        </TouchableOpacity>
      ))}
      {isCreator && (
        <TouchableOpacity onPress={startEditing} style={styles.editButton} hitSlop={8}>
          <Text style={styles.edit}>✎ Edit release</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 16 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: colors.ink2, fontSize: 11, fontWeight: "600" },
  editButton: { borderWidth: 1, borderColor: "rgba(225,29,46,0.6)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  edit: { color: colors.redSoft, fontSize: 11, fontWeight: "700" },
  editor: { borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 12, padding: 14, gap: 14, marginBottom: 16, backgroundColor: colors.surface },
  editorTitle: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  label: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  hint: { color: colors.ink3, fontSize: 12, lineHeight: 17 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
  },
  buttons: { flexDirection: "row", gap: 8 },
  save: { flex: 1, backgroundColor: colors.red, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  saveText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  cancel: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16 },
  cancelText: { color: colors.ink2, fontSize: 14, fontWeight: "600" },
});
