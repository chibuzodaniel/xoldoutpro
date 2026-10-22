import { Text, View, StyleSheet } from "react-native";
import { GENRES, MOODS, MAX_GENRES, MAX_MOODS } from "../../lib/musicTags";
import { colors } from "../../lib/theme";
import { Pill } from "../creator/Pill";

function toggle(list: string[], slug: string, max: number) {
  if (list.includes(slug)) return list.filter((s) => s !== slug);
  return list.length >= max ? list : [...list, slug];
}

// Mirrors web's components/music/TagPicker.tsx — genre + mood chips for a
// release (Music tab, V1.2), used by the upload and the tag editor.
export function TagPicker({
  genres,
  moods,
  onGenres,
  onMoods,
}: {
  genres: string[];
  moods: string[];
  onGenres: (next: string[]) => void;
  onMoods: (next: string[]) => void;
}) {
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
      <View style={[styles.head, { marginTop: 8 }]}>
        <Text style={styles.label}>Mood</Text>
        <Text style={styles.hint}>Optional · up to {MAX_MOODS}</Text>
      </View>
      <View style={styles.chips}>
        {MOODS.map((m) => (
          <Pill key={m.slug} label={`${m.icon} ${m.label}`} active={moods.includes(m.slug)} onPress={() => onMoods(toggle(moods, m.slug, MAX_MOODS))} />
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
