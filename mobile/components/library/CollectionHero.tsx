import { ActivityIndicator, Image, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts } from "../../lib/theme";
import { PlayIcon, PauseIcon } from "../PlayerIcons";

// Mirrors the Apple Music "Heavy Rotation" playlist-header pattern: a
// blurred cover wash behind the title, then a prominent Play pill (plus an
// optional Shuffle button) rather than a small icon tucked in a corner.
// RN's <Image> supports blurRadius natively, so this needs no extra
// dependency for the frosted-artwork look.
export function CollectionHero({
  title,
  subtitle,
  coverImage,
  onPlay,
  onShuffle,
  playBusy,
  playDisabled,
  isPlaying,
}: {
  title: string;
  subtitle: string;
  coverImage: string | null;
  onPlay: () => void;
  onShuffle?: () => void;
  playBusy?: boolean;
  playDisabled?: boolean;
  // Whether this collection's own content is the thing currently playing —
  // swaps the pill to Pause and toggles instead of always restarting.
  isPlaying?: boolean;
}) {
  return (
    <View style={styles.hero}>
      {coverImage ? (
        <Image source={{ uri: coverImage }} style={StyleSheet.absoluteFill} blurRadius={30} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.coverFallback]} />
      )}
      <LinearGradient colors={["rgba(10,10,11,0.35)", colors.bg]} style={StyleSheet.absoluteFill} />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
        {!playDisabled && (
          <View style={styles.buttonsRow}>
            {onShuffle && (
              <TouchableOpacity style={styles.roundButton} onPress={onShuffle}>
                <Text style={styles.roundButtonIcon}>🔀</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.playPill} onPress={onPlay} disabled={playBusy}>
              {playBusy ? (
                <ActivityIndicator size="small" color={colors.bg} />
              ) : isPlaying ? (
                <>
                  <PauseIcon color={colors.bg} size={13} />
                  <Text style={styles.playText}>Pause</Text>
                </>
              ) : (
                <>
                  <PlayIcon color={colors.bg} size={13} />
                  <Text style={styles.playText}>Play</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingTop: 24, paddingBottom: 24, paddingHorizontal: 20, overflow: "hidden" },
  coverFallback: { backgroundColor: colors.surface2 },
  content: { alignItems: "center" },
  title: { color: colors.ink, fontSize: 24, fontFamily: fonts.serif, textAlign: "center", marginBottom: 4 },
  subtitle: { color: colors.ink2, fontSize: 13, marginBottom: 20 },
  buttonsRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  roundButtonIcon: { fontSize: 16 },
  playPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 28,
    paddingVertical: 12,
    minWidth: 140,
  },
  playText: { color: colors.bg, fontSize: 15, fontWeight: "700" },
});
