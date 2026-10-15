import { Image, Modal, Pressable, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// Full-screen view of a photo sent in a direct message — mirrors web's
// components/messages/ImageViewer.tsx (explicit ask, 2026-10-15). Closes on
// ✕, a tap anywhere, or Android's back button.
export function ImageViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={Boolean(uri)} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <Pressable style={styles.backdrop} onPress={onClose}>
        {uri && <Image source={{ uri }} style={styles.image} resizeMode="contain" />}
      </Pressable>
      <View style={styles.closeWrap} pointerEvents="box-none">
        <TouchableOpacity onPress={onClose} style={styles.close} accessibilityLabel="Close" hitSlop={10}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.96)", alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  closeWrap: { position: "absolute", top: 48, right: 16 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  closeText: { color: "#fff", fontSize: 18 },
});
