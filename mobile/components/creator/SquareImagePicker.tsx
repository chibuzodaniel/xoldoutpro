import { useState } from "react";
import { ActivityIndicator, Alert, Image, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../../lib/AuthContext";
import { uploadAndFinalizeArtwork } from "../../lib/uploadImage";
import { colors } from "../../lib/theme";

// Square image picker + upload, shared by every publish wizard's
// artwork/cover/photo field (they all resolve to the same server-side
// artwork ladder). `wide` renders a full-width rectangle for the event cover
// instead of a fixed square box, matching web's layout difference there.
export function SquareImagePicker({
  label,
  placeholder,
  ladder,
  onChange,
  wide,
}: {
  label: string;
  placeholder: string;
  ladder: Record<string, string> | null;
  onChange: (ladder: Record<string, string> | null) => void;
  wide?: boolean;
}) {
  const { firebaseUser } = useAuth();
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const previewUri = preview ?? ladder?.["1024"] ?? null;

  async function pick() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0] || !firebaseUser) return;
    const asset = result.assets[0];
    setPreview(asset.uri);
    setUploading(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const newLadder = await uploadAndFinalizeArtwork(asset.uri, asset.mimeType ?? "image/jpeg", idToken);
      onChange(newLadder);
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not process the image");
      setPreview(null);
    } finally {
      setUploading(false);
    }
  }

  function remove() {
    setPreview(null);
    onChange(null);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, wide && styles.boxWide]}>
        <TouchableOpacity style={styles.tap} onPress={pick} disabled={uploading}>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.image} />
          ) : (
            <Text style={styles.placeholder}>{placeholder}</Text>
          )}
        </TouchableOpacity>
        {uploading && (
          <View style={styles.overlay}>
            <ActivityIndicator color={colors.ink} />
          </View>
        )}
        {previewUri && !uploading && (
          <TouchableOpacity style={styles.removeButton} onPress={remove}>
            <Text style={styles.removeText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  box: { width: 128, height: 128, borderRadius: 10, overflow: "hidden" },
  boxWide: { width: "100%", height: 140 },
  tap: {
    flex: 1,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  image: { width: "100%", height: "100%" },
  placeholder: { color: colors.ink3, fontSize: 11, textAlign: "center", paddingHorizontal: 12 },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  removeButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { color: colors.ink, fontSize: 10 },
});
