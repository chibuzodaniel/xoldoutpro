import { useState } from "react";
import { Modal, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { colors } from "../lib/theme";

// Mirrors web's components/ui/TicketQrCode.tsx: a small inline QR is too
// small to reliably scan off a phone screen at a door — tapping it opens
// the same code at full-screen size instead.
export function TicketQrCode({ value, label, size = 56 }: { value: string; label?: string; size?: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TouchableOpacity style={styles.thumbBox} onPress={() => setExpanded(true)}>
        <QRCode value={value} size={size} backgroundColor={colors.ink} />
      </TouchableOpacity>

      <Modal visible={expanded} transparent animationType="fade" onRequestClose={() => setExpanded(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setExpanded(false)}>
          <TouchableOpacity style={styles.closeButton} onPress={() => setExpanded(false)}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.qrLarge}>
            <QRCode value={value} size={280} backgroundColor={colors.ink} />
          </View>
          {label && <Text style={styles.label}>{label}</Text>}
          <Text style={styles.hint}>Tap anywhere to close</Text>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumbBox: { padding: 4, backgroundColor: colors.ink, borderRadius: 6 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 24 },
  closeButton: {
    position: "absolute",
    top: 48,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { color: colors.ink, fontSize: 16 },
  qrLarge: { backgroundColor: colors.ink, borderRadius: 20, padding: 24 },
  label: { color: colors.ink, fontSize: 14, fontWeight: "600", textAlign: "center" },
  hint: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
});
