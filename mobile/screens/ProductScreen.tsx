import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
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
import { Avatar } from "../components/Avatar";

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
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const image = imageFor(product);
  const isSoldOut = Boolean(product.stockPolicy?.soldOutAt);
  const cap = product.stockPolicy?.cap ?? null;
  const sold = product.stockPolicy?.sold ?? 0;
  const remaining = cap !== null ? Math.max(cap - sold, 0) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[styles.imageBox, { width, height: width }]}>
        {image ? (
          <Image source={{ uri: image }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{product.title}</Text>
        <TouchableOpacity onPress={() => navigation.navigate("Creator", { handle: product.creator.handle })}>
          <View style={styles.creatorRow}>
            <Avatar uri={product.creator.avatarUrl} name={product.creator.displayName} index={0} size={24} />
            <Text style={styles.creatorName}>{product.creator.displayName}</Text>
          </View>
        </TouchableOpacity>

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
                <Text style={styles.trackOrder}>{t.order}</Text>
                <Text style={styles.trackTitle} numberOfLines={1}>
                  {t.title}
                </Text>
              </View>
            ))}
          </View>
        )}

        {product.beat && (
          <View style={styles.beatMeta}>
            {product.beat.bpm && <Text style={styles.metaText}>{product.beat.bpm} BPM</Text>}
            {product.beat.musicalKey && <Text style={styles.metaText}>Key: {product.beat.musicalKey}</Text>}
          </View>
        )}

        <TouchableOpacity
          style={styles.webButton}
          onPress={() => Linking.openURL(`${API_BASE_URL}${webPathFor(product)}`)}
        >
          <Text style={styles.webButtonText}>Buy on xoldout.app</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#050505" },
  errorText: { color: "#FF6B7A", fontSize: 14 },
  imageBox: { backgroundColor: "#1a1a1a" },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { backgroundColor: "#1a1a1a" },
  content: { padding: 16 },
  title: { color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 8 },
  creatorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  creatorName: { color: "#ccc", fontSize: 14 },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  price: { color: "#fff", fontSize: 18, fontWeight: "600" },
  stat: { color: "#FF6B7A", fontSize: 13, fontWeight: "600" },
  statDim: { color: "#999", fontSize: 13 },
  description: { color: "#bbb", fontSize: 13, lineHeight: 19, marginBottom: 16 },
  trackList: { marginBottom: 16 },
  trackRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1a1a1a" },
  trackOrder: { color: "#666", fontSize: 12, width: 24 },
  trackTitle: { color: "#eee", fontSize: 14, flex: 1 },
  beatMeta: { flexDirection: "row", gap: 16, marginBottom: 16 },
  metaText: { color: "#999", fontSize: 12 },
  webButton: { backgroundColor: "#E11D2E", borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  webButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
