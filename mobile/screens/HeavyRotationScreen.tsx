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
import { CollectionHero } from "../components/library/CollectionHero";

const HORIZONTAL_PADDING = 16;

function coverFor(p: HeavyRotationProduct) {
  return p.release?.artworkLadder?.["1024"] ?? p.beat?.coverImageLadder?.["1024"] ?? p.merchItem?.imageLadder?.["1024"] ?? null;
}

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
  const [playingAll, setPlayingAll] = useState(false);

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

  async function tracksFor(p: HeavyRotationProduct): Promise<PlayableTrack[]> {
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
  }

  const isPlayingThis = player.isPlaying && (products ?? []).some((p) => p.id === player.current?.productId);

  // Merch has no audio to play, so it's excluded from the queue. Plays the
  // first item's track(s) as soon as they're ready (instant for a beat, one
  // fetch for a release) instead of waiting on every item via Promise.all —
  // that used to delay the mini player appearing by however long the
  // slowest lookup took. The rest loads in the background and appends via
  // playNext once ready.
  async function handlePlayAll() {
    if (!products) return;
    if (isPlayingThis) {
      player.togglePlay();
      return;
    }
    const playable = products.filter((p) => p.type !== "MERCH");
    if (playable.length === 0) return;
    setPlayingAll(true);
    try {
      const [first, ...rest] = playable;
      const firstTracks = await tracksFor(first);
      if (firstTracks.length > 0) player.play(firstTracks[0], firstTracks);
      setPlayingAll(false);
      if (rest.length > 0) {
        const restGroups = await Promise.all(rest.map(tracksFor));
        const restTracks = restGroups.flat();
        if (restTracks.length > 0) player.playNext(restTracks);
      }
    } catch {
      setPlayingAll(false);
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
      <CollectionHero
        title="Heavy Rotation"
        subtitle={`${products.length} item${products.length === 1 ? "" : "s"} · your most-played, last 60 days`}
        coverImage={products[0] ? coverFor(products[0]) : null}
        onPlay={handlePlayAll}
        playBusy={playingAll}
        playDisabled={products.length === 0}
        isPlaying={isPlayingThis}
      />
      <View style={styles.body}>
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
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 40 },
  body: { padding: HORIZONTAL_PADDING },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  emptyText: { color: colors.ink3, fontSize: 13 },
});
