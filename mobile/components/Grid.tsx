import type { ReactNode } from "react";
import { View, StyleSheet } from "react-native";

// Plain flex-wrap grid (no FlatList) — this screen is one fixed set of
// sections, not a long homogeneous list, so a wrapping row per section is
// simpler than juggling numColumns per section.
export function Grid({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  return <View style={[styles.grid, { gap }]}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap" },
});
