import type { ReactNode } from "react";
import { Image, Text, View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../lib/theme";

// The icon+wordmark row every top-level tab screen shows, mirroring web's
// AppHeader — HomeScreen additionally puts a bell button beside this via
// `right`, since notifications live only on the Discover tab there too.
export function AppLogoHeader({ right, style }: { right?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.left}>
        <Image source={require("../assets/xoldout-icon-transparent.png")} style={styles.icon} />
        <Text style={styles.title}>XOLDOUT</Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  left: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { width: 22, height: 22 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "800", letterSpacing: -0.3 },
});
