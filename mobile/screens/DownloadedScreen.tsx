import { useEffect, useState } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View, StyleSheet, useWindowDimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { listDownloads, type DownloadMeta } from "../lib/offline/downloads";
import { usePlayer } from "../lib/PlayerContext";
import type { RootStackParamList } from "../lib/navigation";
import type { PlayableTrack } from "../lib/playerTypes";
import { colors, fonts } from "../lib/theme";
import { CollectionHero } from "../components/library/CollectionHero";
import { Grid } from "../components/Grid";

const HORIZONTAL_PADDING = 16;

function toPlayable(d: DownloadMeta): PlayableTrack {
  return {
    trackId: d.trackId,
    title: d.title,
    artistName: d.artistName,
    artworkUrl: d.artworkUrl,
    productId: d.productId,
    lyricsText: null,
    kind: "track",
  };
}

// Automatic collection, not server data at all — purely a view over this
// device's own local offline cache, so it's per-device by nature, same as
// the cache itself. Mirrors web's /library/collections/downloaded.
export function DownloadedScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const player = usePlayer();
  const { width } = useWindowDimensions();
  const tileWidth = (width - HORIZONTAL_PADDING * 2 - 24) / 3;
  const [downloads, setDownloads] = useState<DownloadMeta[] | null>(null);

  // Tapping a track plays it (queuing the rest of the downloaded list, same
  // "play what's on this list" pattern the Purchased tab uses) and opens
  // the full player, rather than just navigating to the release's page.
  function handlePress(d: DownloadMeta) {
    if (player.current?.trackId !== d.trackId) {
      const queue = (downloads ?? []).map(toPlayable);
      const track = queue.find((t) => t.trackId === d.trackId) ?? toPlayable(d);
      player.play(track, queue);
    } else if (!player.isPlaying) {
      player.togglePlay();
    }
    navigation.navigate("Player");
  }

  useEffect(() => {
    listDownloads().then((list) => setDownloads([...list].sort((a, b) => b.downloadedAt - a.downloadedAt)));
  }, []);

  const isPlayingThis = player.isPlaying && (downloads ?? []).some((d) => d.trackId === player.current?.trackId);

  function handlePlayAll() {
    if (isPlayingThis) {
      player.togglePlay();
      return;
    }
    if (!downloads || downloads.length === 0) return;
    const queue = downloads.map(toPlayable);
    player.play(queue[0], queue);
  }

  if (!downloads) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <CollectionHero
        title="Downloaded"
        subtitle={`${downloads.length} item${downloads.length === 1 ? "" : "s"} · playable offline on this device`}
        coverImage={downloads[0]?.artworkUrl ?? null}
        onPlay={handlePlayAll}
        playDisabled={downloads.length === 0}
        isPlaying={isPlayingThis}
      />

      <View style={styles.body}>
      {downloads.length === 0 ? (
        <Text style={styles.emptyText}>Nothing downloaded on this device yet — save a track for offline from Purchased.</Text>
      ) : (
        <Grid>
          {downloads.map((d) => {
            const isThisPlaying = player.isPlaying && player.current?.trackId === d.trackId;
            return (
              <TouchableOpacity key={d.trackId} style={{ width: tileWidth }} onPress={() => handlePress(d)}>
                <View style={[styles.artBox, { width: tileWidth, height: tileWidth }]}>
                  {d.artworkUrl ? (
                    <Image source={{ uri: d.artworkUrl }} style={styles.art} />
                  ) : (
                    <View style={[styles.art, styles.artworkPlaceholder]} />
                  )}
                  {isThisPlaying && (
                    <View style={styles.playingBadge}>
                      <Text style={styles.playingBadgeText}>♫</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.title} numberOfLines={1}>
                  {d.title}
                </Text>
                <Text style={styles.artist} numberOfLines={1}>
                  {d.artistName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </Grid>
      )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 40 },
  body: { padding: 16 },
  emptyText: { color: colors.ink3, fontSize: 13 },
  artBox: { borderRadius: 8, backgroundColor: colors.surface2, overflow: "hidden", position: "relative", marginBottom: 6 },
  art: { width: "100%", height: "100%" },
  artworkPlaceholder: { backgroundColor: colors.surface2 },
  playingBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  playingBadgeText: { color: colors.ink, fontSize: 11 },
  title: { color: colors.ink, fontSize: 13, fontWeight: "600", fontFamily: fonts.serif },
  artist: { color: colors.ink3, fontSize: 12, marginTop: 1 },
});
