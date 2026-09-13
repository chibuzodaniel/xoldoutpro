import { Modal, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { colors } from "../lib/theme";

export type ActionSheetAction = { label: string; onPress: () => void; destructive?: boolean };

export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: ActionSheetAction[];
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          {title && (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          )}
          <View style={styles.list}>
            {actions.map((a, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.row, i > 0 && styles.rowBorder]}
                onPress={() => {
                  onClose();
                  a.onPress();
                }}
              >
                <Text style={[styles.rowText, a.destructive && styles.destructiveText]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 28 },
  title: { color: colors.ink3, fontSize: 12, fontWeight: "700", textTransform: "uppercase", textAlign: "center", marginBottom: 8 },
  list: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.lineSoft, marginBottom: 12 },
  row: { paddingVertical: 14, alignItems: "center" },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.lineSoft },
  rowText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  destructiveText: { color: colors.redSoft },
  cancelButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  cancelText: { color: colors.ink2, fontSize: 14, fontWeight: "600" },
});
