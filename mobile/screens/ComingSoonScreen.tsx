import { SafeAreaView, StyleSheet, Text } from "react-native";
import { colors, fonts } from "../lib/theme";

// Placeholder for tabs whose real content isn't built yet — the nav
// structure comes first, per xoldoutpro's web/mobile split
// (PLAY MUSIC/LIBRARY/SOCIAL/CREATOR TOOLS all still to come on mobile).
export function ComingSoonScreen({ title }: { title: string }) {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>Coming soon</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: 8 },
  title: { color: colors.ink, fontSize: 20, fontFamily: fonts.serif },
  subtitle: { color: colors.ink3, fontSize: 13 },
});
