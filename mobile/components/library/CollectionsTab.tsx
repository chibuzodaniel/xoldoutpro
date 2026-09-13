import { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import type { Collection } from "../../lib/collectionTypes";
import type { RootStackParamList } from "../../lib/navigation";
import { colors } from "../../lib/theme";

function CollectionCard({ collection, width, onPress }: { collection: Collection; width: number; onPress: () => void }) {
  const covers = collection.covers.slice(0, 4);
  return (
    <TouchableOpacity style={{ width }} onPress={onPress}>
      <View style={[styles.coverBox, { width, height: width }]}>
        {covers.length === 0 ? (
          <View style={[styles.coverCell, styles.coverPlaceholder, { width, height: width }]} />
        ) : covers.length === 1 ? (
          <Image source={{ uri: covers[0] }} style={{ width, height: width }} />
        ) : (
          <View style={styles.coverGrid}>
            {covers.map((url, i) => (
              <Image key={i} source={{ uri: url }} style={[styles.coverCell, { width: width / 2 - 0.5, height: width / 2 - 0.5 }]} />
            ))}
          </View>
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {collection.name}
      </Text>
      <Text style={styles.cardSubtitle}>
        {collection.itemCount} item{collection.itemCount === 1 ? "" : "s"}
      </Text>
    </TouchableOpacity>
  );
}

export function CollectionsTab() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser
      .getIdToken()
      .then((idToken) => apiGet<{ collections: Collection[] }>("/api/collections", idToken))
      .then((data) => setCollections(data.collections))
      .catch(() => setCollections([]));
  }, [firebaseUser]);

  async function createCollection() {
    const name = newName.trim();
    if (!name || !firebaseUser) return;
    setCreating(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const data = await apiPost<{ collection: Collection }>("/api/collections", idToken, { name });
      setCollections((cur) => [data.collection, ...(cur ?? [])]);
      setNewName("");
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  if (collections === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  const cardWidth = 110;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
      <View style={styles.createRow}>
        <TextInput
          style={styles.input}
          value={newName}
          onChangeText={(t) => setNewName(t.slice(0, 60))}
          placeholder="New collection name"
          placeholderTextColor={colors.ink3}
        />
        <TouchableOpacity style={styles.createButton} onPress={createCollection} disabled={creating || !newName.trim()}>
          <Text style={styles.createButtonText}>Create</Text>
        </TouchableOpacity>
      </View>

      {collections.length === 0 ? (
        <Text style={styles.emptyText}>Group what you own into collections — start by naming one above, then add items from Purchased.</Text>
      ) : (
        <View style={styles.grid}>
          {collections.map((c) => (
            <CollectionCard
              key={c.id}
              collection={c}
              width={cardWidth}
              onPress={() => navigation.navigate("Collection", { id: c.id, name: c.name })}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyText: { color: colors.ink3, fontSize: 13, lineHeight: 19 },
  createRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
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
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  coverBox: { borderRadius: 8, backgroundColor: colors.surface2, overflow: "hidden", marginBottom: 6 },
  coverGrid: { flexDirection: "row", flexWrap: "wrap", gap: 1 },
  coverCell: {},
  coverPlaceholder: { backgroundColor: colors.surface2 },
  cardTitle: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  cardSubtitle: { color: colors.ink3, fontSize: 12, marginTop: 1 },
});
