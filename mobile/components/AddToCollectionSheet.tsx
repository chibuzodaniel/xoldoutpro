import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { apiGet, apiPost } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import type { Collection } from "../lib/collectionTypes";
import { colors, fonts } from "../lib/theme";

export function AddToCollectionSheet({
  entitlementId,
  visible,
  onClose,
}: {
  entitlementId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { firebaseUser } = useAuth();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [newName, setNewName] = useState("");
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible || !firebaseUser) return;
    firebaseUser
      .getIdToken()
      .then((idToken) => apiGet<{ collections: Collection[] }>("/api/collections", idToken))
      .then((data) => setCollections(data.collections))
      .catch(() => setCollections([]));
  }, [visible, firebaseUser]);

  async function addTo(collectionId: string) {
    if (!firebaseUser) return;
    setBusy(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPost(`/api/collections/${collectionId}/items`, idToken, { entitlementId });
      setAddedTo((cur) => new Set(cur).add(collectionId));
    } catch {
      // ignore — the row just won't show "Added"
    } finally {
      setBusy(false);
    }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name || !firebaseUser) return;
    setBusy(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const data = await apiPost<{ collection: Collection }>("/api/collections", idToken, { name });
      setCollections((cur) => [data.collection, ...(cur ?? [])]);
      setNewName("");
      await addTo(data.collection.id);
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Add to collection</Text>

          {collections === null ? (
            <ActivityIndicator color={colors.ink} style={{ marginVertical: 24 }} />
          ) : (
            <View style={styles.list}>
              {collections.length === 0 && <Text style={styles.emptyText}>No collections yet — create one below.</Text>}
              {collections.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.row}
                  onPress={() => addTo(c.id)}
                  disabled={busy || addedTo.has(c.id)}
                >
                  <Text style={styles.rowText}>
                    {c.name} <Text style={styles.rowCount}>· {c.itemCount}</Text>
                  </Text>
                  {addedTo.has(c.id) && <Text style={styles.addedText}>Added</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.createRow}>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={(t) => setNewName(t.slice(0, 60))}
              placeholder="New collection name"
              placeholderTextColor={colors.ink3}
            />
            <TouchableOpacity style={styles.createButton} onPress={createAndAdd} disabled={busy || !newName.trim()}>
              <Text style={styles.createButtonText}>Create</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 32 },
  title: { color: colors.ink, fontSize: 20, fontFamily: fonts.serif, marginBottom: 16 },
  emptyText: { color: colors.ink3, fontSize: 13, paddingVertical: 12 },
  list: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.lineSoft, marginBottom: 16, maxHeight: 200 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  rowText: { color: colors.ink, fontSize: 14 },
  rowCount: { color: colors.ink3 },
  addedText: { color: colors.redSoft, fontSize: 12, fontWeight: "600" },
  createRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.ink,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  createButton: { backgroundColor: colors.red, borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  createButtonText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
});
