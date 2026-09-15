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
import type { FeedPost } from "../../lib/socialTypes";
import { colors, fonts } from "../../lib/theme";

const MAX_LEN = 500;

export function PostComposer({
  visible,
  onClose,
  onPosted,
}: {
  visible: boolean;
  onClose: () => void;
  onPosted: (post: FeedPost) => void;
}) {
  const { firebaseUser } = useAuth();
  const [body, setBody] = useState("");
  const [image, setImage] = useState<{ uri: string; type: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickImage() {
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
    setImage({ uri: asset.uri, type: asset.mimeType ?? "image/jpeg" });
  }

  function reset() {
    setBody("");
    setImage(null);
    setError(null);
  }

  async function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed || !firebaseUser) return;
    setSubmitting(true);
    setError(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      let imageUrl: string | null = null;
      if (image) {
        const key = await uploadImage(image.uri, image.type, "artwork", idToken);
        const data = await apiPost<{ artworkLadder: Record<string, string> }>("/api/uploads/artwork/finalize", idToken, { key });
        imageUrl = data.artworkLadder["1024"];
      }
      const data = await apiPost<{ post: FeedPost }>("/api/posts", idToken, { body: trimmed, imageUrl });
      onPosted(data.post);
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish post");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheet}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.title}>New post</Text>

          <TextInput
            style={styles.textArea}
            value={body}
            onChangeText={(t) => setBody(t.slice(0, MAX_LEN))}
            placeholder="Share an update with your fans…"
            placeholderTextColor={colors.ink3}
            multiline
            numberOfLines={3}
          />

          {image && (
            <View style={styles.imagePreviewBox}>
              <Image source={{ uri: image.uri }} style={styles.imagePreview} />
              <TouchableOpacity style={styles.removeImageButton} onPress={() => setImage(null)}>
                <Text style={styles.removeImageText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.footer}>
            <TouchableOpacity onPress={pickImage}>
              <Text style={styles.imagePickerIcon}>🖼</Text>
            </TouchableOpacity>
            <View style={styles.footerRight}>
              <Text style={styles.charCount}>
                {body.length}/{MAX_LEN}
              </Text>
              <TouchableOpacity style={styles.postButton} onPress={handleSubmit} disabled={submitting || !body.trim()}>
                {submitting ? (
                  <ActivityIndicator size="small" color={colors.ink} />
                ) : (
                  <Text style={styles.postButtonText}>Post</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
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
  title: { color: colors.ink, fontSize: 20, fontFamily: fonts.serif, marginBottom: 16 },
  textArea: { color: colors.ink, fontSize: 14, minHeight: 60, textAlignVertical: "top" },
  imagePreviewBox: { marginTop: 8, width: 128, height: 128, borderRadius: 10, overflow: "hidden", position: "relative" },
  imagePreview: { width: "100%", height: "100%" },
  removeImageButton: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeImageText: { color: colors.ink, fontSize: 10 },
  errorText: { color: colors.redSoft, fontSize: 12, marginTop: 8 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  imagePickerIcon: { fontSize: 22 },
  footerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  charCount: { color: colors.ink3, fontSize: 11 },
  postButton: { backgroundColor: colors.red, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, minWidth: 56, alignItems: "center" },
  postButtonText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
});
