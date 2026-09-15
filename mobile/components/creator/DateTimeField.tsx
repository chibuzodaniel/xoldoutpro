import { useState } from "react";
import { Platform, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { colors } from "../../lib/theme";

// Cross-platform date+time picker: Android has no combined "datetime" mode,
// so it chains a date dialog into a time dialog; iOS renders a single
// inline "datetime" wheel that collapses behind a Done button.
export function DateTimeField({
  label,
  value,
  onChange,
  clearable,
}: {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  clearable?: boolean;
}) {
  const [showIOSPicker, setShowIOSPicker] = useState(false);

  function openAndroid() {
    const base = value ?? new Date();
    DateTimePickerAndroid.open({
      value: base,
      mode: "date",
      onChange: (event, date) => {
        if (event.type !== "set" || !date) return;
        DateTimePickerAndroid.open({
          value: date,
          mode: "time",
          onChange: (timeEvent, time) => {
            if (timeEvent.type !== "set" || !time) return;
            const combined = new Date(date);
            combined.setHours(time.getHours(), time.getMinutes());
            onChange(combined);
          },
        });
      },
    });
  }

  function openPicker() {
    if (Platform.OS === "android") openAndroid();
    else setShowIOSPicker(true);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TouchableOpacity style={styles.button} onPress={openPicker}>
          <Text style={styles.buttonText}>{value ? formatDateTime(value) : "Select date & time"}</Text>
        </TouchableOpacity>
        {clearable && value && (
          <TouchableOpacity onPress={() => onChange(null)}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>
      {Platform.OS === "ios" && showIOSPicker && (
        <View style={styles.iosPickerWrap}>
          <DateTimePicker
            value={value ?? new Date()}
            mode="datetime"
            display="spinner"
            onChange={(_, date) => date && onChange(date)}
            themeVariant="dark"
          />
          <TouchableOpacity style={styles.doneButton} onPress={() => setShowIOSPicker(false)}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function formatDateTime(date: Date) {
  return date.toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  button: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  buttonText: { color: colors.ink, fontSize: 13 },
  clearText: { color: colors.ink3, fontSize: 12 },
  iosPickerWrap: { backgroundColor: colors.surface, borderRadius: 10, marginTop: 4 },
  doneButton: { alignItems: "center", paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  doneText: { color: colors.redSoft, fontSize: 13, fontWeight: "600" },
});
