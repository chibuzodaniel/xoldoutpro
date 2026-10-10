import { Share, StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";
import { API_BASE_URL } from "../lib/api";
import { colors } from "../lib/theme";

// Share a profile (explicit ask, 2026-10-10) — mirrors web's ShareButton on
// /u/[handle] and /profile: the link opens the public profile, which carries
// the name/bio/avatar preview for chat apps.
export function ShareProfileButton({
  handle,
  displayName,
  own = false,
  style,
}: {
  handle: string;
  displayName: string;
  own?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const url = `${API_BASE_URL}/u/${handle}`;
  const message = own ? `Follow me on XOLDOUT — @${handle}\n${url}` : `Check out ${displayName} (@${handle}) on XOLDOUT\n${url}`;
  return (
    <TouchableOpacity style={[styles.button, style]} onPress={() => Share.share({ message }).catch(() => {})}>
      <Text style={styles.icon}>↗</Text>
      <Text style={styles.text}>{own ? "Share my profile" : "Share profile"}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: colors.red, paddingHorizontal: 14, paddingVertical: 8 },
  icon: { color: "#fff", fontSize: 14, fontWeight: "700" },
  text: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
