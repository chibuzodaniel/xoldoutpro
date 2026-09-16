import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
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
import type { EventDetail } from "../lib/eventDetailTypes";
import { formatNaira } from "../lib/format";
import { colors, fonts } from "../lib/theme";
import { PublishedByYou } from "../components/PublishedByYou";
import { SoldCount } from "../components/SoldCount";
import { ReportButton } from "../components/ReportButton";
import { EventPromotersPanel } from "../components/EventPromotersPanel";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
}

export function EventScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Event">>();
  const { id } = route.params;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    apiGet<{ event: EventDetail }>(`/api/events/${id}`)
      .then((data) => setEvent(data.event))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [id]);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  const cover = event.coverImageLadder?.["1024"];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <View style={[styles.imageBox, { width, height: (width * 3) / 4 }]}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Event</Text>
        </View>

        <View style={styles.headerRow}>
          <View style={styles.headerInfo}>
            <Text style={styles.title}>{event.title}</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Creator", { handle: event.creator.handle })}>
              <Text style={styles.creatorName}>{event.creator.displayName}</Text>
            </TouchableOpacity>
            <PublishedByYou creatorId={event.creatorId} />
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={() =>
                Share.share({ message: `${event.title} — ${event.creator.displayName} on XOLDOUT\n${API_BASE_URL}/e/${event.id}` }).catch(
                  () => {},
                )
              }
            >
              <Text style={styles.shareIcon}>↗</Text>
              <Text style={styles.shareText}>Share</Text>
            </TouchableOpacity>
            <ReportButton targetType="EVENT" targetId={event.id} ownerId={event.creatorId} />
          </View>
        </View>

        <View style={styles.detailsBlock}>
          <Text style={styles.detailText}>
            {formatDate(event.startsAt)} · {formatTime(event.startsAt)}
          </Text>
          <Text style={styles.detailText}>{event.isVirtual ? "Virtual event" : event.venue ?? "Venue TBA"}</Text>
        </View>

        {event.description && <Text style={styles.description}>{event.description}</Text>}

        <Text style={styles.sectionTitle}>Tickets</Text>
        <View style={styles.tierList}>
          {event.tiers.map((tier) => {
            const isSoldOut = Boolean(tier.product.stockPolicy?.soldOutAt);
            const cap = tier.product.stockPolicy?.cap ?? null;
            const sold = tier.product.stockPolicy?.sold ?? 0;
            const remaining = cap !== null ? Math.max(cap - sold, 0) : null;
            return (
              <View key={tier.productId} style={styles.tierRow}>
                <View style={styles.tierHeaderRow}>
                  <Text style={styles.tierName}>{tier.name}</Text>
                  <Text style={styles.tierPrice}>{formatNaira(tier.product.priceKobo)}</Text>
                </View>
                {isSoldOut ? (
                  <Text style={styles.tierStat}>Sold out</Text>
                ) : remaining !== null ? (
                  <Text style={styles.tierStat}>{`${remaining} of ${cap} left`}</Text>
                ) : (
                  <SoldCount creatorId={event.creatorId} sold={sold} />
                )}
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={styles.webButton} onPress={() => Linking.openURL(`${API_BASE_URL}/e/${event.id}`)}>
          <Text style={styles.webButtonText}>Get tickets on xoldout.app</Text>
        </TouchableOpacity>

        <EventPromotersPanel
          eventId={event.id}
          eventTitle={event.title}
          creatorId={event.creatorId}
          onFocusInput={() => scrollRef.current?.scrollToEnd({ animated: true })}
        />
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
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
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(225,29,46,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  badgeText: { color: colors.redSoft, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  headerInfo: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 14, paddingTop: 2 },
  shareButton: { flexDirection: "row", alignItems: "center", gap: 4 },
  shareIcon: { color: colors.redSoft, fontSize: 16 },
  shareText: { color: colors.redSoft, fontSize: 13, fontWeight: "600" },
  title: { color: colors.ink, fontSize: 22, fontFamily: fonts.serif, marginBottom: 4 },
  creatorName: { color: colors.ink2, fontSize: 14 },
  detailsBlock: { marginBottom: 16, gap: 2 },
  detailText: { color: colors.ink2, fontSize: 13 },
  description: { color: colors.ink2, fontSize: 13, lineHeight: 19, marginBottom: 20 },
  sectionTitle: { color: colors.ink3, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  tierList: { gap: 8, marginBottom: 20 },
  tierRow: { borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 10, padding: 12 },
  tierHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  tierName: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  tierPrice: { color: colors.ink, fontSize: 14, fontFamily: fonts.serif },
  tierStat: { color: colors.ink3, fontSize: 12 },
  webButton: { backgroundColor: colors.red, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  webButtonText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
});
