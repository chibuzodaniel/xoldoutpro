import { useEffect, useState } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { listDownloads, type DownloadMeta } from "../lib/offline/downloads";
import { usePlayer } from "../lib/PlayerContext";
import type { RootStackParamList } from "../lib/navigation";
import type { PlayableTrack } from "../lib/playerTypes";
import { colors, fonts } from "../lib/theme";

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
    navigation.setOptions({ title: "Downloaded" });
  }, [navigation]);

  useEffect(() => {
    listDownloads().then((list) => setDownloads([...list].sort((a, b) => b.downloadedAt - a.downloadedAt)));
  }, []);

  if (!downloads) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>
        {downloads.length} item{downloads.length === 1 ? "" : "s"} · playable offline on this device
      </Text>

      {downloads.length === 0 ? (
        <Text style={styles.emptyText}>Nothing downloaded on this device yet — save a track for offline from Purchased.</Text>
      ) : (
        <View style={styles.list}>
          {downloads.map((d) => (
            <TouchableOpacity key={d.trackId} style={styles.row} onPress={() => handlePress(d)}>
              {d.artworkUrl ? (
                <Image source={{ uri: d.artworkUrl }} style={styles.artwork} />
              ) : (
                <View style={[styles.artwork, styles.artworkPlaceholder]} />
              )}
              <View style={styles.info}>
                <Text style={styles.title} numberOfLines={1}>
                  {d.title}
                </Text>
                <Text style={styles.artist} numberOfLines={1}>
                  {d.artistName}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  subtitle: { color: colors.ink3, fontSize: 12, marginBottom: 16 },
  emptyText: { color: colors.ink3, fontSize: 13 },
  list: {},
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  artwork: { width: 44, height: 44, borderRadius: 6 },
  artworkPlaceholder: { backgroundColor: colors.surface2 },
  info: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 14, fontWeight: "600", fontFamily: fonts.serif },
  artist: { color: colors.ink3, fontSize: 12, marginTop: 1 },
});
