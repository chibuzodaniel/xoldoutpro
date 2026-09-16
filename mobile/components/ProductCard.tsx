import { Image, Text, View, StyleSheet } from "react-native";
import type { ProductCardData } from "../lib/discoverTypes";
import { categoryLabelFor, formatNaira, imageUrlFor } from "../lib/format";
import { colors, fonts } from "../lib/theme";

// Mirrors web's components/product/ProductCard.tsx: image plus category
// label, title, creator, and price alongside either sold count or the
// remaining-stock count.
export function ProductCard({ product, width, owned }: { product: ProductCardData; width: number; owned?: boolean }) {
  const isSoldOut = Boolean(product.stockPolicy?.soldOutAt);
  const cap = product.stockPolicy?.cap ?? null;
  const sold = product.stockPolicy?.sold ?? 0;
  const remaining = cap !== null ? Math.max(cap - sold, 0) : null;
  const imageUrl = imageUrlFor(product, "256");

  return (
    <View style={{ width }}>
      <View style={[styles.imageBox, { width, height: width }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}

        <View style={styles.badge}>
          <Text style={styles.badgeText}>{categoryLabelFor(product)}</Text>
        </View>

        {isSoldOut && (
          <View style={styles.soldOutOverlay}>
            <Text style={styles.soldOutText}>Sold out</Text>
          </View>
        )}

        {owned && !isSoldOut && (
          <View style={styles.ownedBadge}>
            <Text style={styles.ownedBadgeText}>Owned</Text>
          </View>
        )}
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {product.title}
      </Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {product.creator.displayName}
      </Text>
      <View style={styles.row}>
        <Text style={styles.price}>{formatNaira(product.priceKobo)}</Text>
        {remaining !== null ? (
          <Text style={styles.remaining}>{isSoldOut ? "Sold out" : `${remaining} left`}</Text>
        ) : (
          <Text style={styles.sold}>{sold} sold</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageBox: { borderRadius: 8, backgroundColor: colors.surface2, overflow: "hidden", position: "relative" },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { backgroundColor: colors.surface2 },
  badge: {
    position: "absolute",
    left: 6,
    top: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { color: colors.ink, fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  soldOutOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  ownedBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ownedBadgeText: { color: colors.redSoft, fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  soldOutText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  title: { color: colors.ink, fontSize: 12, fontWeight: "600", marginTop: 6 },
  subtitle: { color: colors.ink3, fontSize: 12, marginTop: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  price: { color: colors.ink, fontSize: 12, fontFamily: fonts.serif },
  remaining: { color: colors.redSoft, fontSize: 12, fontWeight: "600" },
  sold: { color: colors.ink3, fontSize: 12 },
});
