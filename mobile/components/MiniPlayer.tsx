import { ActivityIndicator, Image, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { usePlayer } from "../lib/PlayerContext";
import type { RootStackParamList } from "../lib/navigation";
import { colors, fonts } from "../lib/theme";

// Rendered once, globally, above the bottom tab bar — persists across tab
// switches the same way web's mini-player survives route changes. Tapping
// the row (artwork/title, not the play/pause button) opens the full
// PlayerScreen, mirroring web's MiniPlayer -> ExpandedPlayer tap-to-expand.
export function MiniPlayer() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { current, isPlaying, loading, togglePlay } = usePlayer();
  if (!current) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.tapArea} onPress={() => navigation.navigate("Player")} activeOpacity={0.8}>
        {current.artworkUrl ? (
          <Image source={{ uri: current.artworkUrl }} style={styles.art} />
        ) : (
          <View style={[styles.art, styles.artPlaceholder]} />
        )}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {current.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {current.artistName}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.playButton} onPress={togglePlay} disabled={loading}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.ink} />
        ) : (
          <Text style={styles.playIcon}>{isPlaying ? "⏸" : "▶"}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tapArea: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  art: { width: 36, height: 36, borderRadius: 6 },
  artPlaceholder: { backgroundColor: colors.surface2 },
  info: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 13, fontFamily: fonts.serif },
  artist: { color: colors.ink3, fontSize: 11, marginTop: 1 },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: { color: colors.ink, fontSize: 12 },
});
