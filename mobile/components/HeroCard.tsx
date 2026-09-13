import { Image, Text, View, StyleSheet, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { ProductCardData } from "../lib/discoverTypes";
import { formatNaira } from "../lib/format";
import { colors, fonts } from "../lib/theme";

// Mirrors web's discover page hero banner: the weekly top-selling release
// (or the newest one, if nothing's sold yet this week). The gradient
// matches web's `bg-gradient-to-t from-black/95 via-black/10 to-black/40`.
export function HeroCard({ hero, heroWeeklySold }: { hero: ProductCardData; heroWeeklySold: number }) {
  const { width } = useWindowDimensions();
  const cardWidth = width - 32;
  const cardHeight = (cardWidth * 5) / 4;

  const art = hero.release?.artworkLadder?.["1024"];
  const isSoldOut = Boolean(hero.stockPolicy?.soldOutAt);
  const cap = hero.stockPolicy?.cap ?? null;
  const sold = hero.stockPolicy?.sold ?? 0;
  const remaining = cap !== null ? Math.max(cap - sold, 0) : null;

  return (
    <View style={[styles.container, { width: cardWidth, height: cardHeight }]}>
      {art ? (
        <Image source={{ uri: art }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]} />
      )}

      <LinearGradient
        colors={["rgba(0,0,0,0.95)", "rgba(0,0,0,0.1)", "rgba(0,0,0,0.4)"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.typeBadge}>
        <Text style={styles.typeBadgeText}>{(hero.release?.releaseType ?? "single").toLowerCase()}</Text>
      </View>
      <View style={styles.sellBadge}>
        <Text style={styles.sellBadgeText}>{heroWeeklySold > 0 ? "Top Seller This Week" : "New Release"}</Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.creator} numberOfLines={1}>
          {hero.creator.displayName.toUpperCase()}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {hero.title}
        </Text>
        <View style={styles.row}>
          {remaining !== null ? (
            <Text style={styles.stat}>{isSoldOut ? "Sold out" : `${remaining} of ${cap} left`}</Text>
          ) : heroWeeklySold > 0 ? (
            <Text style={styles.stat}>{heroWeeklySold} sold this week</Text>
          ) : (
            <Text style={styles.statDim}>{sold} sold</Text>
          )}
          <Text style={styles.price}>{formatNaira(hero.priceKobo)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface2, position: "relative" },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { backgroundColor: colors.surface2 },
  typeBadge: {
    position: "absolute",
    left: 12,
    top: 12,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  typeBadgeText: { color: colors.ink, fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  sellBadge: {
    position: "absolute",
    left: 12,
    top: 44,
    borderRadius: 999,
    backgroundColor: colors.red,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sellBadgeText: { color: colors.ink, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  footer: { position: "absolute", left: 16, right: 16, bottom: 16 },
  creator: { color: "rgba(255,255,255,0.6)", fontSize: 12, letterSpacing: 1, marginBottom: 4 },
  title: { color: colors.ink, fontSize: 22, fontFamily: fonts.serif, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stat: { color: colors.redSoft, fontSize: 12, fontWeight: "600" },
  statDim: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  price: { color: colors.ink, fontSize: 18, fontFamily: fonts.serif },
});
