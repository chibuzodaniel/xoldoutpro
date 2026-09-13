import { Image, Text, View, StyleSheet } from "react-native";
import type { EventData } from "../lib/discoverTypes";
import { formatDate, formatNaira } from "../lib/format";
import { colors, fonts } from "../lib/theme";

// Mirrors web's components/product/EventCard.tsx: shows the cheapest
// tier's price and sold-across-all-tiers, since an event groups several
// independently-priced/capped ticket tiers.
export function EventCard({ event, width }: { event: EventData; width: number }) {
  const cover = event.coverImageLadder?.["256"];
  const minPriceKobo = Math.min(...event.tiers.map((t) => t.priceKobo));
  const totalSold = event.tiers.reduce((sum, t) => sum + (t.stockPolicy?.sold ?? 0), 0);
  const allSoldOut = event.tiers.length > 0 && event.tiers.every((t) => Boolean(t.stockPolicy?.soldOutAt));

  return (
    <View style={{ width }}>
      <View style={[styles.imageBox, { width, height: width }]}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}

        <View style={styles.badge}>
          <Text style={styles.badgeText}>{formatDate(event.startsAt)}</Text>
        </View>

        {allSoldOut && (
          <View style={styles.soldOutOverlay}>
            <Text style={styles.soldOutText}>Sold out</Text>
          </View>
        )}
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {event.title}
      </Text>
      <View style={styles.row}>
        <Text style={styles.price}>{minPriceKobo === 0 ? "Free" : `From ${formatNaira(minPriceKobo)}`}</Text>
        <Text style={styles.sold}>{allSoldOut ? "Sold out" : `${totalSold} sold`}</Text>
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
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  price: { color: colors.ink, fontSize: 12, fontFamily: fonts.serif },
  sold: { color: colors.ink3, fontSize: 12 },
});
