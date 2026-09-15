import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../lib/AuthContext";
import { apiGet, apiDelete } from "../lib/api";
import { formatNaira, formatDate } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import type { CatalogEvent } from "../lib/catalogTypes";
import { colors, fonts } from "../lib/theme";

export function CatalogEventsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();
  const [events, setEvents] = useState<CatalogEvent[] | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    const data = await apiGet<{ events: CatalogEvent[] }>("/api/events", idToken);
    setEvents(data.events);
  }, [firebaseUser]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    navigation.setOptions({
      title: "Events",
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate("PublishEvent")}>
          <Text style={styles.headerLink}>+ New event</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  async function handleRemoveTier(eventId: string, tierProductId: string, tierName: string) {
    if (!firebaseUser) return;
    Alert.alert(`Take "${tierName}" off sale?`, "Anyone who already bought this tier keeps their ticket — this is not a refund.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const idToken = await firebaseUser.getIdToken();
          try {
            await apiDelete(`/api/events/${eventId}/tiers/${tierProductId}`, idToken);
            load();
          } catch {
            Alert.alert("Could not remove tier");
          }
        },
      },
    ]);
  }

  if (!events) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={events}
      keyExtractor={(e) => e.id}
      ListEmptyComponent={<Text style={styles.emptyText}>Nothing published yet.</Text>}
      renderItem={({ item: event }) => {
        const artwork = event.coverImageLadder?.["64"];
        return (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              {artwork ? <Image source={{ uri: artwork }} style={styles.artwork} /> : <View style={[styles.artwork, styles.artworkPlaceholder]} />}
              <View style={styles.cardInfo}>
                <TouchableOpacity onPress={() => navigation.navigate("Event", { id: event.id })}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {event.title}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.cardMeta}>
                  {formatDate(event.startsAt)}
                  {event.venue ? ` · ${event.venue}` : " · Virtual"}
                </Text>
              </View>
            </View>

            <View style={styles.tiers}>
              {event.tiers.map((tier) => {
                const cap = tier.product.stockPolicy?.cap ?? null;
                const sold = tier.product.stockPolicy?.sold ?? 0;
                const isSoldOut = Boolean(tier.product.stockPolicy?.soldOutAt);
                const remaining = cap !== null ? Math.max(cap - sold, 0) : null;
                return (
                  <View key={tier.productId} style={styles.tierRow}>
                    <View style={styles.tierInfo}>
                      <Text style={styles.tierName}>{tier.name}</Text>
                      <Text style={styles.tierMeta}>
                        {formatNaira(tier.product.priceKobo)} ·{" "}
                        {remaining !== null ? (isSoldOut ? "Sold out" : `${remaining} left`) : `${sold} sold`}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleRemoveTier(event.id, tier.productId, tier.name)}>
                      <Text style={styles.removeTier}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity onPress={() => navigation.navigate("Event", { id: event.id })}>
              <Text style={styles.manageLink}>Manage event →</Text>
            </TouchableOpacity>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  emptyText: { color: colors.ink3, fontSize: 13 },
  headerLink: { color: colors.redSoft, fontSize: 13, fontWeight: "600" },
  card: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  artwork: { width: 44, height: 44, borderRadius: 8 },
  artworkPlaceholder: { backgroundColor: colors.surface2 },
  cardInfo: { flex: 1, minWidth: 0 },
  cardTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.serif },
  cardMeta: { color: colors.ink3, fontSize: 12, marginTop: 2 },
  tiers: { gap: 8, paddingLeft: 4 },
  tierRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tierInfo: { flex: 1, minWidth: 0 },
  tierName: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  tierMeta: { color: colors.ink3, fontSize: 11.5, marginTop: 1 },
  removeTier: { color: colors.ink3, fontSize: 12 },
  manageLink: { color: colors.redSoft, fontSize: 12, fontWeight: "600" },
});
