import { useEffect, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { usePlayer } from "../../lib/PlayerContext";
import { listDownloads, type DownloadMeta } from "../../lib/offline/downloads";
import type { Collection, CollectionDetailItem } from "../../lib/collectionTypes";
import type { HeavyRotationProduct } from "../../lib/heavyRotationTypes";
import type { ProductDetail } from "../../lib/productDetailTypes";
import type { PlayableTrack } from "../../lib/playerTypes";
import type { RootStackParamList } from "../../lib/navigation";
import { buildPlayable } from "../../lib/libraryHelpers";
import { colors } from "../../lib/theme";

function CollectionCard({
  name,
  itemCount,
  covers,
  width,
  onPress,
  onPlayAll,
  playAllBusy,
}: {
  name: string;
  itemCount: number;
  covers: string[];
  width: number;
  onPress: () => void;
  onPlayAll?: () => void;
  playAllBusy?: boolean;
}) {
  // covers[0] is the most recently added item's artwork — the list API
  // orders by addedAt desc — so the card's cover updates as the collection
  // changes rather than freezing on whatever was first added.
  const cover = covers[0] ?? null;
  return (
    <TouchableOpacity style={{ width }} onPress={onPress}>
      <View style={[styles.coverBox, { width, height: width }]}>
        {cover ? (
          <Image source={{ uri: cover }} style={{ width, height: width }} />
        ) : (
          <View style={[styles.coverCell, styles.coverPlaceholder, { width, height: width }]} />
        )}
        {onPlayAll && itemCount > 0 && (
          <TouchableOpacity
            style={styles.playAllButton}
            onPress={(e) => {
              e.stopPropagation();
              onPlayAll();
            }}
            disabled={playAllBusy}
          >
            {playAllBusy ? <ActivityIndicator size="small" color={colors.ink} /> : <Text style={styles.playAllIcon}>▶</Text>}
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.cardSubtitle}>
        {itemCount} item{itemCount === 1 ? "" : "s"}
      </Text>
    </TouchableOpacity>
  );
}

function imageUrlForHeavyRotation(p: HeavyRotationProduct) {
  return p.release?.artworkLadder?.["256"] ?? p.beat?.coverImageLadder?.["256"] ?? null;
}

export function CollectionsTab() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();
  const player = usePlayer();
  const [playingAllId, setPlayingAllId] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [downloads, setDownloads] = useState<DownloadMeta[]>([]);
  const [heavyRotationProducts, setHeavyRotationProducts] = useState<HeavyRotationProduct[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [playingAllAuto, setPlayingAllAuto] = useState<"downloaded" | "heavyRotation" | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser
      .getIdToken()
      .then((idToken) => apiGet<{ collections: Collection[] }>("/api/collections", idToken))
      .then((data) => setCollections(data.collections))
      .catch(() => setCollections([]));

    listDownloads().then(setDownloads);

    firebaseUser
      .getIdToken()
      .then((idToken) => apiGet<{ products: HeavyRotationProduct[] }>("/api/library/heavy-rotation", idToken))
      .then((data) => setHeavyRotationProducts(data.products))
      .catch(() => {});
  }, [firebaseUser]);

  function handlePlayAllDownloaded() {
    if (downloads.length === 0) return;
    const queue: PlayableTrack[] = downloads.map((d) => ({
      trackId: d.trackId,
      title: d.title,
      artistName: d.artistName,
      artworkUrl: d.artworkUrl,
      productId: d.productId,
      lyricsText: null,
      kind: "track",
    }));
    player.play(queue[0], queue);
  }

  // Merch has no audio and is excluded; a release needs its full tracklist
  // fetched (this screen's summary card data doesn't carry it), a beat's
  // "track" is just the product itself.
  async function handlePlayAllHeavyRotation() {
    if (heavyRotationProducts.length === 0) return;
    setPlayingAllAuto("heavyRotation");
    try {
      const groups = await Promise.all(
        heavyRotationProducts
          .filter((p) => p.type !== "MERCH")
          .map(async (p): Promise<PlayableTrack[]> => {
            if (p.type === "BEAT") {
              return [
                {
                  trackId: p.id,
                  title: p.title,
                  artistName: p.creator.displayName,
                  artworkUrl: p.beat?.coverImageLadder?.["1024"] ?? null,
                  productId: p.id,
                  lyricsText: null,
                  kind: "beat",
                },
              ];
            }
            const data = await apiGet<{ product: ProductDetail }>(`/api/products/${p.id}`);
            const tracks = data.product.release?.tracks ?? [];
            const art = data.product.release?.artworkLadder?.["1024"] ?? null;
            return tracks.map((t) => ({
              trackId: t.id,
              title: t.title,
              artistName: data.product.creator.displayName,
              artworkUrl: art,
              productId: p.id,
              lyricsText: null,
              kind: "track",
            }));
          }),
      );
      const queue = groups.flat();
      if (queue.length > 0) player.play(queue[0], queue);
    } finally {
      setPlayingAllAuto(null);
    }
  }

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

  async function handlePlayAllCollection(c: Collection) {
    if (!firebaseUser) return;
    setPlayingAllId(c.id);
    try {
      const idToken = await firebaseUser.getIdToken();
      const data = await apiGet<{ items: CollectionDetailItem[] }>(`/api/collections/${c.id}`, idToken);
      const queue = data.items.map((i) => i.entitlement).flatMap(buildPlayable);
      if (queue.length === 0) return;
      player.play(queue[0], queue);
    } catch {
      // best-effort
    } finally {
      setPlayingAllId(null);
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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
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

      {(downloads.length > 0 || heavyRotationProducts.length > 0) && (
        <View style={[styles.grid, styles.autoGrid]}>
          {downloads.length > 0 && (
            <CollectionCard
              name="Downloaded"
              itemCount={downloads.length}
              covers={downloads.map((d) => d.artworkUrl).filter((u): u is string => !!u)}
              width={cardWidth}
              onPress={() => navigation.navigate("Downloaded")}
              onPlayAll={handlePlayAllDownloaded}
            />
          )}
          {heavyRotationProducts.length > 0 && (
            <CollectionCard
              name="Heavy Rotation"
              itemCount={heavyRotationProducts.length}
              covers={heavyRotationProducts.map(imageUrlForHeavyRotation).filter((u): u is string => !!u)}
              width={cardWidth}
              onPress={() => navigation.navigate("HeavyRotation")}
              onPlayAll={handlePlayAllHeavyRotation}
              playAllBusy={playingAllAuto === "heavyRotation"}
            />
          )}
        </View>
      )}

      {collections.length === 0 ? (
        <Text style={styles.emptyText}>Group what you own into collections — start by naming one above, then add items from Purchased.</Text>
      ) : (
        <View style={styles.grid}>
          {collections.map((c) => (
            <CollectionCard
              key={c.id}
              name={c.name}
              itemCount={c.itemCount}
              covers={c.covers}
              width={cardWidth}
              onPress={() => navigation.navigate("Collection", { id: c.id, name: c.name })}
              onPlayAll={() => handlePlayAllCollection(c)}
              playAllBusy={playingAllId === c.id}
            />
          ))}
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyText: { color: colors.ink3, fontSize: 13, lineHeight: 19 },
  createRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  autoGrid: { marginBottom: 20 },
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
  coverBox: { borderRadius: 8, backgroundColor: colors.surface2, overflow: "hidden", marginBottom: 6, position: "relative" },
  playAllButton: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  playAllIcon: { color: colors.ink, fontSize: 12, marginLeft: 1 },
  coverCell: {},
  coverPlaceholder: { backgroundColor: colors.surface2 },
  cardTitle: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  cardSubtitle: { color: colors.ink3, fontSize: 12, marginTop: 1 },
});
