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
  // Same look as the page's other small buttons (Insights / Wallet / Message).
  button: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  icon: { color: colors.ink2, fontSize: 12, fontWeight: "600" },
  text: { color: colors.ink2, fontSize: 12, fontWeight: "600" },
});
