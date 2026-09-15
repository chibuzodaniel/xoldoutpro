import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { API_BASE_URL, apiGet } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";
import type { ProductDetail } from "../lib/productDetailTypes";
import { formatNaira } from "../lib/format";
import { usePreviewPlayer } from "../lib/usePreviewPlayer";
import { colors, fonts } from "../lib/theme";
import { Avatar } from "../components/Avatar";
import { PublishedByYou } from "../components/PublishedByYou";
import { ReportButton } from "../components/ReportButton";

const TYPE_LABEL: Record<ProductDetail["type"], string> = { RELEASE: "", BEAT: "Beat", MERCH: "Merch" };

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function PreviewButton({
  playing,
  loading,
  onPress,
}: {
  playing: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.previewButton} onPress={onPress} disabled={loading}>
      {loading ? (
        <ActivityIndicator size="small" color={colors.ink} />
      ) : (
        <Text style={styles.previewIcon}>{playing ? "⏸" : "▶"}</Text>
      )}
    </TouchableOpacity>
  );
}

function webPathFor(product: ProductDetail) {
  if (product.type === "BEAT") return `/b/${product.id}`;
  if (product.type === "MERCH") return `/m/${product.id}`;
  return `/r/${product.id}`;
}

function imageFor(product: ProductDetail) {
  if (product.type === "BEAT") return product.beat?.coverImageLadder?.["1024"];
  if (product.type === "MERCH") return product.merchItem?.imageLadder?.["1024"];
  return product.release?.artworkLadder?.["1024"];
}

export function ProductScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Product">>();
  const { id } = route.params;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = usePreviewPlayer();

  useEffect(() => {
    apiGet<{ product: ProductDetail }>(`/api/products/${id}`)
      .then((data) => setProduct(data.product))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [id]);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  const image = imageFor(product);
  const isSoldOut = Boolean(product.stockPolicy?.soldOutAt);
  const cap = product.stockPolicy?.cap ?? null;
  const sold = product.stockPolicy?.sold ?? 0;
  const remaining = cap !== null ? Math.max(cap - sold, 0) : null;

  const typeLabel = TYPE_LABEL[product.type];
  const gallery = product.merchItem?.galleryImageUrls ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[styles.imageBox, { width, height: width }]}>
        {image ? (
          <Image source={{ uri: image }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}
      </View>

      {gallery.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
          {gallery.map((url) => (
            <Image key={url} source={{ uri: url }} style={styles.galleryThumb} />
          ))}
        </ScrollView>
      )}

      <View style={styles.content}>
        {typeLabel !== "" && (
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{typeLabel}</Text>
          </View>
        )}

        <View style={styles.headerRow}>
          <View style={styles.headerInfo}>
            <Text style={styles.title}>{product.title}</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Creator", { handle: product.creator.handle })}>
              <View style={styles.creatorRow}>
                <Avatar uri={product.creator.avatarUrl} name={product.creator.displayName} index={0} size={24} />
                <Text style={styles.creatorName}>{product.creator.displayName}</Text>
              </View>
            </TouchableOpacity>
            <PublishedByYou creatorId={product.creatorId} />
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() =>
                Share.share({ message: `${product.title} — ${product.creator.displayName} on XOLDOUT\n${API_BASE_URL}${webPathFor(product)}` }).catch(
                  () => {},
                )
              }
            >
              <Text style={styles.shareIcon}>↗</Text>
            </TouchableOpacity>
            <ReportButton targetType="PRODUCT" targetId={product.id} ownerId={product.creatorId} />
          </View>
        </View>

        {product.beat && (product.beat.bpm || product.beat.musicalKey || product.beat.tags.length > 0) && (
          <View style={styles.chipsRow}>
            {product.beat.bpm && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{product.beat.bpm} BPM</Text>
              </View>
            )}
            {product.beat.musicalKey && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{product.beat.musicalKey}</Text>
              </View>
            )}
            {product.beat.tags.map((tag) => (
              <View key={tag} style={styles.chip}>
                <Text style={styles.chipText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatNaira(product.priceKobo)}</Text>
          {remaining !== null ? (
            <Text style={styles.stat}>{isSoldOut ? "Sold out" : `${remaining} of ${cap} left`}</Text>
          ) : (
            <Text style={styles.statDim}>{sold} sold</Text>
          )}
        </View>

        {product.description && <Text style={styles.description}>{product.description}</Text>}

        {product.release && product.release.tracks.length > 0 && (
          <View style={styles.trackList}>
            {product.release.tracks.map((t) => (
              <View key={t.id} style={styles.trackRow}>
                <PreviewButton
                  playing={preview.isPlaying(t.id)}
                  loading={preview.isLoading(t.id)}
                  onPress={() => preview.toggle("track", t.id)}
                />
                <Text style={styles.trackOrder}>{t.order}</Text>
                <Text style={styles.trackTitle} numberOfLines={1}>
                  {t.title}
                </Text>
                <Text style={styles.trackDuration}>{formatDuration(t.durationSec)}</Text>
              </View>
            ))}
          </View>
        )}

        {product.beat && (
          <View style={styles.beatPreviewRow}>
            <PreviewButton
              playing={preview.isPlaying(product.id)}
              loading={preview.isLoading(product.id)}
              onPress={() => preview.toggle("beat", product.id)}
            />
            <Text style={styles.metaText}>{formatDuration(product.beat.durationSec)}</Text>
          </View>
        )}

        {preview.error && <Text style={styles.errorText}>{preview.error}</Text>}

        <TouchableOpacity
          style={styles.webButton}
          onPress={() => Linking.openURL(`${API_BASE_URL}${webPathFor(product)}`)}
        >
          <Text style={styles.webButtonText}>Buy on xoldout.app</Text>
        </TouchableOpacity>

        {product.type === "BEAT" && (
          <TouchableOpacity onPress={() => Linking.openURL(`${API_BASE_URL}/legal/terms#beat-licenses`)}>
            <Text style={styles.licenseLink}>View license terms</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  errorText: { color: colors.redSoft, fontSize: 14 },
  imageBox: { backgroundColor: colors.surface2 },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { backgroundColor: colors.surface2 },
  content: { padding: 16 },
  galleryRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  galleryThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.surface2 },
  typeBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(225,29,46,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  typeBadgeText: { color: colors.redSoft, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  headerInfo: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 14, paddingTop: 2 },
  shareIcon: { color: colors.ink2, fontSize: 18 },
  title: { color: colors.ink, fontSize: 22, fontFamily: fonts.serif, marginBottom: 8 },
  creatorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  creatorName: { color: colors.ink2, fontSize: 14 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { color: colors.ink2, fontSize: 12 },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, marginBottom: 12 },
  price: { color: colors.ink, fontSize: 18, fontFamily: fonts.serif },
  stat: { color: colors.redSoft, fontSize: 13, fontWeight: "600" },
  statDim: { color: colors.ink3, fontSize: 13 },
  description: { color: colors.ink2, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  trackList: { marginBottom: 16 },
  trackRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  trackOrder: { color: colors.ink3, fontSize: 12, width: 16 },
  trackTitle: { color: colors.ink2, fontSize: 14, flex: 1 },
  trackDuration: { color: colors.ink3, fontSize: 12 },
  beatPreviewRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  metaText: { color: colors.ink3, fontSize: 12 },
  previewButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  previewIcon: { color: colors.ink, fontSize: 12 },
  webButton: { backgroundColor: colors.red, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  webButtonText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  licenseLink: { color: colors.ink3, fontSize: 11, textAlign: "center", textDecorationLine: "underline", marginTop: 12 },
});
