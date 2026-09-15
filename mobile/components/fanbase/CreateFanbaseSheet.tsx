import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { apiPost } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { uploadImage } from "../../lib/uploadImage";
import type { FanbaseGroup } from "../../lib/fanbaseTypes";
import { colors, fonts } from "../../lib/theme";

export function CreateFanbaseSheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (groupId: string, groupName: string) => void;
}) {
  const { firebaseUser } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<{ uri: string; type: string } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setDescription("");
    setPhoto(null);
    setPhotoKey(null);
    setError(null);
  }

  async function pickPhoto() {
    if (!firebaseUser) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const type = asset.mimeType ?? "image/jpeg";
    setPhoto({ uri: asset.uri, type });
    setUploadingPhoto(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const key = await uploadImage(asset.uri, type, "avatar", idToken);
      setPhotoKey(key);
    } catch {
      setError("Couldn't upload that photo. Try again.");
      setPhoto(null);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed || !firebaseUser) return;
    setSubmitting(true);
    setError(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      const data = await apiPost<{ group: FanbaseGroup }>("/api/groups", idToken, {
        name: trimmed,
        description: description.trim() || undefined,
        visibility: "REQUEST_TO_JOIN",
        coverImageKey: photoKey ?? undefined,
      });
      onCreated(data.group.id, data.group.name);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create Fanbase");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Create Fanbase</Text>

          <TouchableOpacity style={styles.photoButton} onPress={pickPhoto} disabled={uploadingPhoto}>
            {photo ? (
              <Image source={{ uri: photo.uri }} style={styles.photoImage} />
            ) : (
              <Text style={styles.photoInitial}>{(name.trim() || "?").slice(0, 1).toUpperCase()}</Text>
            )}
            {uploadingPhoto && (
              <View style={styles.photoOverlay}>
                <ActivityIndicator size="small" color={colors.ink} />
              </View>
            )}
            {!photo && !uploadingPhoto && (
              <View style={styles.photoPlus}>
                <Text style={styles.photoPlusText}>+</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.label}>Fanbase name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(t) => setName(t.slice(0, 60))}
            placeholder="e.g. The Inner Circle"
            placeholderTextColor={colors.ink3}
          />

          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={(t) => setDescription(t.slice(0, 500))}
            placeholder="What's this group for?"
            placeholderTextColor={colors.ink3}
            multiline
          />

          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>
              Private by default — fans must request to join, and you approve every member.
            </Text>
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? (
              <ActivityIndicator size="small" color={colors.ink} />
            ) : (
              <Text style={styles.submitButtonText}>Create Fanbase</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 32 },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { color: colors.ink3, fontSize: 12 },
  title: { color: colors.ink, fontSize: 20, fontFamily: fonts.serif, marginBottom: 16, textAlign: "center" },
  photoButton: {
    alignSelf: "center",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    position: "relative",
    overflow: "hidden",
  },
  photoImage: { width: "100%", height: "100%" },
  photoInitial: { color: colors.ink, fontSize: 28, fontWeight: "600" },
  photoOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  photoPlus: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.red,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  photoPlusText: { color: colors.ink, fontSize: 14, fontWeight: "700", marginTop: -1 },
  label: { color: colors.ink3, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.ink,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: { minHeight: 60, textAlignVertical: "top" },
  noticeBox: { flexDirection: "row", borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 8, padding: 12, marginTop: 16 },
  noticeText: { color: colors.ink3, fontSize: 12, flex: 1 },
  errorText: { color: colors.redSoft, fontSize: 12, marginTop: 8 },
  submitButton: { backgroundColor: colors.red, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  submitButtonText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
});
