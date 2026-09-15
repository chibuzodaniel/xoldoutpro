import { Text, TextInput, View, StyleSheet, type TextInputProps } from "react-native";
import { colors } from "../../lib/theme";

export function LabeledInput({ label, hint, style, ...props }: { label: string; hint?: string } & TextInputProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {/* style must merge with, not replace, the base input style below —
          a caller-supplied style (e.g. every Description field's
          multiline `textArea` override) previously clobbered it wholesale
          via `{...props}` spreading after a plain `style={styles.input}`,
          silently dropping color: colors.ink along with it. That's what
          made typed text invisible against the dark background — no color
          left meant it fell back to the platform default (black). */}
      <TextInput placeholderTextColor={colors.ink3} style={[styles.input, style]} {...props} />
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.ink,
    fontSize: 14,
  },
  hint: { color: colors.ink3, fontSize: 10.5, lineHeight: 15 },
});
