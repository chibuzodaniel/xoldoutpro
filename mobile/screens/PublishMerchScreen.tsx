import { useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../lib/AuthContext";
import { apiPost } from "../lib/api";
import { uploadAndFinalizeArtwork } from "../lib/uploadImage";
import { colors, fonts } from "../lib/theme";
import type { RootStackParamList } from "../lib/navigation";
import { SquareImagePicker } from "../components/creator/SquareImagePicker";
import { LabeledInput } from "../components/creator/LabeledInput";
import { PriceField } from "../components/creator/PriceField";
import { CapField } from "../components/creator/CapField";

const MAX_GALLERY = 8;

export function PublishMerchScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceNaira, setPriceNaira] = useState("");
  const [shippingFeeNaira, setShippingFeeNaira] = useState("");
  const [hasCap, setHasCap] = useState(false);
  const [capValue, setCapValue] = useState("");
  const [imageLadder, setImageLadder] = useState<Record<string, string> | null>(null);
  const [gallery, setGallery] = useState<{ uri: string; uploading: boolean; url1024?: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function pickGalleryPhotos() {
    if (!firebaseUser) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsMultipleSelection: true,
      selectionLimit: MAX_GALLERY - gallery.length,
    });
    if (result.canceled || result.assets.length === 0) return;

    const idToken = await firebaseUser.getIdToken();
    const entries = result.assets.map((a) => ({ uri: a.uri, uploading: true }));
    setGallery((cur) => [...cur, ...entries]);

    for (const asset of result.assets) {
      try {
        const ladder = await uploadAndFinalizeArtwork(asset.uri, asset.mimeType ?? "image/jpeg", idToken);
        setGallery((cur) => cur.map((g) => (g.uri === asset.uri ? { ...g, uploading: false, url1024: ladder["1024"] } : g)));
      } catch (e) {
        Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not process a gallery photo");
        setGallery((cur) => cur.filter((g) => g.uri !== asset.uri));
      }
    }
  }

  function removeGalleryPhoto(uri: string) {
    Alert.alert("Remove photo", "This photo will be removed from this draft.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => setGallery((cur) => cur.filter((g) => g.uri !== uri)) },
    ]);
  }

  async function handleSubmit() {
    if (!firebaseUser) return;
    if (!title.trim()) return Alert.alert("Missing title", "Give this listing a title.");
    if (!imageLadder) return Alert.alert("Missing photo", "Add a product photo before publishing.");
    const priceKobo = Math.round(parseFloat(priceNaira || "0") * 100);
    if (!priceNaira || priceKobo <= 0) return Alert.alert("Missing price", "Set a price.");
    const shippingFeeKobo = Math.round(parseFloat(shippingFeeNaira || "0") * 100);
    const cap = hasCap ? parseInt(capValue, 10) : null;
    if (hasCap && (!capValue || !Number.isInteger(cap) || (cap as number) <= 0)) {
      return Alert.alert("Invalid quantity", "Enter a valid limited quantity.");
    }
    if (gallery.some((g) => g.uploading)) return Alert.alert("Still uploading", "Wait for gallery photos to finish uploading.");

    setSubmitting(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const payload = {
        title,
        description,
        priceKobo,
        shippingFeeKobo,
        cap,
        imageLadder,
        galleryImageUrls: gallery.map((g) => g.url1024).filter((u): u is string => !!u),
      };
      await apiPost("/api/merch", idToken, payload);
      Alert.alert("Published", "Your listing is live.", [{ text: "OK", onPress: () => navigation.navigate("Tabs") }]);
    } catch (e) {
      Alert.alert("Could not publish", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Add Merchandise</Text>

      <SquareImagePicker label="Product photo" placeholder="Add square photo" ladder={imageLadder} onChange={setImageLadder} />

      <View style={styles.gallerySection}>
        <Text style={styles.sectionLabel}>Gallery photos (optional)</Text>
        <View style={styles.galleryRow}>
          {gallery.map((g) => (
            <View key={g.uri} style={styles.galleryThumb}>
              <Image source={{ uri: g.uri }} style={styles.galleryImage} />
              {g.uploading && (
                <View style={styles.galleryOverlay}>
                  <ActivityIndicator size="small" color={colors.ink} />
                </View>
              )}
              {!g.uploading && (
                <TouchableOpacity style={styles.galleryRemove} onPress={() => removeGalleryPhoto(g.uri)}>
                  <Text style={styles.galleryRemoveText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          {gallery.length < MAX_GALLERY && (
            <TouchableOpacity style={styles.galleryAdd} onPress={pickGalleryPhotos}>
              <Text style={styles.galleryAddText}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <LabeledInput label="Title" value={title} onChangeText={setTitle} maxLength={200} />
      <LabeledInput
        label="Description"
        value={description}
        onChangeText={setDescription}
        maxLength={2000}
        multiline
        numberOfLines={3}
        style={styles.textArea}
      />

      <PriceField priceNaira={priceNaira} onPriceChange={setPriceNaira} />

      <PriceField
        label="Shipping fee (optional)"
        priceNaira={shippingFeeNaira}
        onPriceChange={setShippingFeeNaira}
        hint="Added to the price at checkout. Leave blank for free shipping."
      />

      <CapField hasCap={hasCap} onHasCapChange={setHasCap} capValue={capValue} onCapValueChange={setCapValue} placeholder="e.g. 100" />

      <Text style={styles.shipNote}>You ship this yourself once an order comes in — mark it shipped from your catalog once it's on its way.</Text>

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitText}>Publish</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 60, gap: 20 },
  title: { color: colors.ink, fontSize: 22, fontFamily: fonts.serif },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  sectionLabel: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  gallerySection: { gap: 8 },
  galleryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  galleryThumb: { width: 64, height: 64, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surface2 },
  galleryImage: { width: "100%", height: "100%" },
  galleryOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  galleryRemove: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  galleryRemoveText: { color: colors.ink, fontSize: 9 },
  galleryAdd: {
    width: 64,
    height: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  galleryAddText: { color: colors.ink3, fontSize: 20 },
  shipNote: { color: colors.ink3, fontSize: 10.5, lineHeight: 15 },
  submitButton: { backgroundColor: colors.red, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  submitText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
});
