import { Text, View, StyleSheet } from "react-native";
import { GENRES, MAX_GENRES } from "../../lib/musicTags";
import { colors } from "../../lib/theme";
import { Pill } from "../creator/Pill";

function toggle(list: string[], slug: string, max: number) {
  if (list.includes(slug)) return list.filter((s) => s !== slug);
  return list.length >= max ? list : [...list, slug];
}

// Mirrors web's components/music/TagPicker.tsx — genre chips for a release
// (Music tab, V1.2), used by the upload and the tag editor. Moods removed 2026-11-04.
export function TagPicker({ genres, onGenres }: { genres: string[]; onGenres: (next: string[]) => void }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.label}>Genre</Text>
        <Text style={styles.hint}>Pick 1–{MAX_GENRES}</Text>
      </View>
      <View style={styles.chips}>
        {GENRES.map((g) => (
          <Pill key={g.slug} label={g.label} active={genres.includes(g.slug)} onPress={() => onGenres(toggle(genres, g.slug, MAX_GENRES))} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  label: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  hint: { color: colors.ink3, fontSize: 11 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
