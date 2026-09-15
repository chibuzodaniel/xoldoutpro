import { Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../../lib/theme";

export function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.pill, active && styles.pillActive]} onPress={onPress}>
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillActive: { borderColor: colors.red, backgroundColor: "rgba(225,29,46,0.12)" },
  label: { color: colors.ink2, fontSize: 12, fontWeight: "600" },
  labelActive: { color: colors.redSoft },
});
