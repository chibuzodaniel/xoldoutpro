import { Text, TextInput, View, StyleSheet } from "react-native";
import { colors } from "../../lib/theme";
import { Pill } from "./Pill";

// Shared "unlimited vs. limited quantity" toggle used by releases, beats,
// merch, and (per-tier) events.
export function CapField({
  hasCap,
  onHasCapChange,
  capValue,
  onCapValueChange,
  cappedLabel = "Capped",
  placeholder = "e.g. 100",
  hint,
}: {
  hasCap: boolean;
  onHasCapChange: (v: boolean) => void;
  capValue: string;
  onCapValueChange: (v: string) => void;
  cappedLabel?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Limited quantity</Text>
      <View style={styles.row}>
        <Pill label={hasCap ? cappedLabel : "Unlimited"} active={hasCap} onPress={() => onHasCapChange(!hasCap)} />
        {hasCap && (
          <TextInput
            value={capValue}
            onChangeText={onCapValueChange}
            keyboardType="numeric"
            placeholder={placeholder}
            placeholderTextColor={colors.ink3}
            style={styles.input}
          />
        )}
      </View>
      {hasCap && hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  input: {
    width: 100,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.ink,
    fontSize: 14,
  },
  hint: { color: colors.ink3, fontSize: 10.5, lineHeight: 15 },
});
