import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../lib/AuthContext";
import { apiGet, apiPatch, apiDelete } from "../lib/api";
import { formatNaira } from "../lib/format";
import { isWithinEditWindow, EDIT_WINDOW_HOURS } from "../lib/editWindow";
import type { RootStackParamList } from "../lib/navigation";
import type { CatalogRelease, CatalogBeat } from "../lib/catalogTypes";
import { colors, fonts } from "../lib/theme";
import { PriceField } from "../components/creator/PriceField";
import { CapField } from "../components/creator/CapField";

type Item = CatalogRelease | CatalogBeat;

const KIND_CONFIG = {
  music: { apiPath: "/api/releases", title: "Catalog", newLabel: "New release", publishScreen: "PublishMusic" as const },
  beats: { apiPath: "/api/beats", title: "Beats & packs", newLabel: "New beat", publishScreen: "PublishBeat" as const },
};

function artworkOf(item: Item): string | undefined {
  return "release" in item ? item.release?.artworkLadder?.["64"] : item.beat?.coverImageLadder?.["64"];
}

function ItemEditor({
  apiPath,
  item,
  idToken,
  onSaved,
}: {
  apiPath: string;
  item: Item;
  idToken: string;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [isFree, setIsFree] = useState(item.priceKobo === 0);
  const [priceNaira, setPriceNaira] = useState(String(item.priceKobo / 100));
  const hasCap = item.stockPolicy?.cap != null;
  const [capValue, setCapValue] = useState(item.stockPolicy?.cap != null ? String(item.stockPolicy.cap) : "");
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    const priceKobo = isFree ? 0 : Math.round(parseFloat(priceNaira || "0") * 100);
    const body: { title?: string; description?: string; priceKobo?: number; cap?: number } = {};
    if (title.trim() && title !== item.title) body.title = title.trim();
    if (description !== item.description) body.description = description;
    if (!Number.isNaN(priceKobo) && priceKobo !== item.priceKobo) body.priceKobo = priceKobo;
    if (hasCap) {
      const cap = parseInt(capValue, 10);
      if (Number.isInteger(cap) && cap !== item.stockPolicy?.cap) body.cap = cap;
    }
    if (Object.keys(body).length === 0) return;

    setBusy(true);
    try {
      await apiPatch(`${apiPath}/${item.id}`, idToken, body);
      onSaved();
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.editor}>
      <TextInput value={title} onChangeText={setTitle} style={styles.editorInput} placeholderTextColor={colors.ink3} />
      <TextInput
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={2}
        style={[styles.editorInput, styles.editorTextarea]}
        placeholderTextColor={colors.ink3}
      />
      <PriceField allowFree isFree={isFree} onFreeChange={setIsFree} priceNaira={priceNaira} onPriceChange={setPriceNaira} />
      {hasCap && (
        <CapField
          hasCap={hasCap}
          onHasCapChange={() => {}}
          capValue={capValue}
          onCapValueChange={setCapValue}
          hint="Cap can only be lowered, never below units already sold."
        />
      )}
      <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.saveButtonText}>Save</Text>}
      </TouchableOpacity>
      <Text style={styles.editorHint}>Editing closes {EDIT_WINDOW_HOURS} hours after publishing.</Text>
    </View>
  );
}

export function CatalogScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "CatalogMusic" | "CatalogBeats">>();
  const kind = route.name === "CatalogBeats" ? "beats" : "music";
  const config = KIND_CONFIG[kind];
  const { firebaseUser } = useAuth();

  const [items, setItems] = useState<Item[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    const data = await apiGet<{ products: Item[] }>(config.apiPath, idToken);
    setItems(data.products);
  }, [firebaseUser, config.apiPath]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    navigation.setOptions({
      title: config.title,
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate(config.publishScreen)}>
          <Text style={styles.headerLink}>+ {config.newLabel}</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, config]);

  async function handleDelete(id: string) {
    if (!firebaseUser) return;
    Alert.alert(
      "Delete this listing?",
      "It comes off sale and every discovery surface immediately. Anyone who already bought it keeps their copy forever — this is not a refund.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const idToken = await firebaseUser.getIdToken();
            try {
              await apiDelete(`${config.apiPath}/${id}`, idToken);
              load();
            } catch {
              Alert.alert("Could not delete");
            }
          },
        },
      ],
    );
  }

  if (!items) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      data={items}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<Text style={styles.emptyText}>Nothing published yet.</Text>}
      renderItem={({ item }) => {
        const artwork = artworkOf(item);
        const isSoldOut = Boolean(item.stockPolicy?.soldOutAt);
        const cap = item.stockPolicy?.cap ?? null;
        const sold = item.stockPolicy?.sold ?? 0;
        const remaining = cap !== null ? Math.max(cap - sold, 0) : null;
        const editable = item.status !== "DELETED" && isWithinEditWindow(item.publishedAt);
        const isEditing = editingId === item.id;

        return (
          <View style={styles.row}>
            <View style={styles.rowTop}>
              {artwork ? <Image source={{ uri: artwork }} style={styles.artwork} /> : <View style={[styles.artwork, styles.artworkPlaceholder]} />}
              <View style={styles.rowInfo}>
                <TouchableOpacity onPress={() => navigation.navigate("Product", { id: item.id })}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.rowMeta}>
                  {item.status === "DELETED" ? "Deleted · " : ""}
                  {formatNaira(item.priceKobo)} ·{" "}
                  {remaining !== null ? (isSoldOut ? "Sold out" : `${remaining} left`) : `${sold} sold`}
                </Text>
              </View>
              {item.status !== "DELETED" && (
                <View style={styles.rowActions}>
                  {editable && (
                    <TouchableOpacity onPress={() => setEditingId(isEditing ? null : item.id)}>
                      <Text style={styles.editLink}>{isEditing ? "Close" : "Edit"}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => handleDelete(item.id)}>
                    <Text style={styles.deleteLink}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {isEditing && firebaseUser && (
              <ItemEditorLoader apiPath={config.apiPath} item={item} onSaved={() => { setEditingId(null); load(); }} />
            )}
          </View>
        );
      }}
    />
    </KeyboardAvoidingView>
  );
}

// Fetches a fresh idToken lazily so ItemEditor's save call always uses a
// non-expired token, without every row re-fetching one on every render.
function ItemEditorLoader({ apiPath, item, onSaved }: { apiPath: string; item: Item; onSaved: () => void }) {
  const { firebaseUser } = useAuth();
  const [idToken, setIdToken] = useState<string | null>(null);

  useEffect(() => {
    firebaseUser?.getIdToken().then(setIdToken);
  }, [firebaseUser]);

  if (!idToken) return null;
  return <ItemEditor apiPath={apiPath} item={item} idToken={idToken} onSaved={onSaved} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  emptyText: { color: colors.ink3, fontSize: 13 },
  headerLink: { color: colors.redSoft, fontSize: 13, fontWeight: "600" },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  artwork: { width: 40, height: 40, borderRadius: 6 },
  artworkPlaceholder: { backgroundColor: colors.surface2 },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  rowMeta: { color: colors.ink3, fontSize: 12, marginTop: 2 },
  rowActions: { flexDirection: "row", gap: 14 },
  editLink: { color: colors.redSoft, fontSize: 12, fontWeight: "600" },
  deleteLink: { color: colors.ink3, fontSize: 12 },
  editor: { marginTop: 10, marginLeft: 52, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.lineSoft, gap: 10 },
  editorInput: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.ink,
    fontSize: 13,
  },
  editorTextarea: { minHeight: 50, textAlignVertical: "top" },
  saveButton: { backgroundColor: colors.red, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  saveButtonText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  editorHint: { color: colors.ink3, fontSize: 10.5 },
});
