import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, StyleSheet, useWindowDimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../lib/AuthContext";
import { apiGet } from "../lib/api";
import { usePlayer } from "../lib/PlayerContext";
import type { RootStackParamList } from "../lib/navigation";
import type { HeavyRotationProduct } from "../lib/heavyRotationTypes";
import type { ProductDetail } from "../lib/productDetailTypes";
import type { PlayableTrack } from "../lib/playerTypes";
import { colors } from "../lib/theme";
import { Grid } from "../components/Grid";
import { ProductCard } from "../components/ProductCard";

const HORIZONTAL_PADDING = 16;

// Automatic collection: your own most-played owned tracks/beats, last 60
// days — mirrors web's /library/collections/heavy-rotation. Not a real
// Collection row, so there's nothing to rename/delete here.
export function HeavyRotationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();
  const player = usePlayer();
  const { width } = useWindowDimensions();
  const threeColWidth = (width - HORIZONTAL_PADDING * 2 - 24) / 3;

  const [products, setProducts] = useState<HeavyRotationProduct[] | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: "Heavy Rotation" });
  }, [navigation]);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser.getIdToken().then((idToken) =>
      apiGet<{ products: HeavyRotationProduct[] }>("/api/library/heavy-rotation", idToken).then((d) => setProducts(d.products)),
    );
  }, [firebaseUser]);

  // Heavy Rotation only has summary card data (no per-track audio), so a
  // release needs its full track list fetched before it can be queued —
  // unlike a beat, whose "track" is just the product itself.
  async function handlePress(p: HeavyRotationProduct) {
    if (p.type === "MERCH") {
      navigation.navigate("Product", { id: p.id });
      return;
    }
    if (player.current?.productId === p.id) {
      if (!player.isPlaying) player.togglePlay();
      navigation.navigate("Player");
      return;
    }
    if (p.type === "BEAT") {
      const track: PlayableTrack = {
        trackId: p.id,
        title: p.title,
        artistName: p.creator.displayName,
        artworkUrl: p.beat?.coverImageLadder?.["1024"] ?? null,
        productId: p.id,
        lyricsText: null,
        kind: "beat",
      };
      player.play(track);
      navigation.navigate("Player");
      return;
    }
    setLoadingId(p.id);
    try {
      const data = await apiGet<{ product: ProductDetail }>(`/api/products/${p.id}`);
      const tracks = data.product.release?.tracks ?? [];
      if (tracks.length === 0) return;
      const art = data.product.release?.artworkLadder?.["1024"] ?? null;
      const queue: PlayableTrack[] = tracks.map((t) => ({
        trackId: t.id,
        title: t.title,
        artistName: data.product.creator.displayName,
        artworkUrl: art,
        productId: p.id,
        lyricsText: null,
        kind: "track",
      }));
      player.play(queue[0], queue);
      navigation.navigate("Player");
    } finally {
      setLoadingId(null);
    }
  }

  if (!products) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>
        {products.length} item{products.length === 1 ? "" : "s"} · your most-played, last 60 days
      </Text>
      {products.length === 0 ? (
        <Text style={styles.emptyText}>Nothing here yet — play something you own and it'll show up.</Text>
      ) : (
        <Grid>
          {products.map((p) => (
            <TouchableOpacity key={p.id} onPress={() => handlePress(p)} disabled={loadingId === p.id}>
              <ProductCard product={p} width={threeColWidth} />
            </TouchableOpacity>
          ))}
        </Grid>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: HORIZONTAL_PADDING, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  subtitle: { color: colors.ink3, fontSize: 12, marginBottom: 16 },
  emptyText: { color: colors.ink3, fontSize: 13 },
});
