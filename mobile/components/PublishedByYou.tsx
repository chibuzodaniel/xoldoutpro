import { Text, View, StyleSheet } from "react-native";
import { useAuth } from "../lib/AuthContext";
import { colors } from "../lib/theme";

// Mirrors web's components/product/PublishedByYou.tsx — renders nothing
// for anyone but the creator.
export function PublishedByYou({ creatorId }: { creatorId: string }) {
  const { appUser } = useAuth();
  if (appUser?.id !== creatorId) return null;

  return (
    <View style={styles.badge}>
      <Text style={styles.text}>Published by you</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(225,29,46,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  text: { color: colors.redSoft, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
});
