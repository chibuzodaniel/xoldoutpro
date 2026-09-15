import { Text, TextInput, View, StyleSheet } from "react-native";
import { colors } from "../../lib/theme";
import { Pill } from "./Pill";

// Shared naira price input. When `allowFree` is set (music/beat), a "Free"
// pill toggles priceNaira off entirely — merch always has a real price.
export function PriceField({
  label = "Price",
  allowFree,
  isFree,
  onFreeChange,
  priceNaira,
  onPriceChange,
  hint,
}: {
  label?: string;
  allowFree?: boolean;
  isFree?: boolean;
  onFreeChange?: (v: boolean) => void;
  priceNaira: string;
  onPriceChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {allowFree && <Pill label="Free" active={!!isFree} onPress={() => onFreeChange?.(!isFree)} />}
        {!(allowFree && isFree) && (
          <View style={styles.priceRow}>
            <Text style={styles.naira}>₦</Text>
            <TextInput
              value={priceNaira}
              onChangeText={onPriceChange}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.ink3}
              style={styles.input}
            />
          </View>
        )}
      </View>
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  naira: { color: colors.ink3, fontSize: 14 },
  input: {
    width: 110,
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
