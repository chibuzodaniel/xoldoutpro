import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../lib/AuthContext";
import { apiGet, apiDelete, apiPatch } from "../lib/api";
import { formatNaira } from "../lib/format";
import type { RootStackParamList } from "../lib/navigation";
import type { CatalogMerchItem } from "../lib/catalogTypes";
import { colors, fonts } from "../lib/theme";

type FulfillmentOrder = {
  id: string;
  buyer: { displayName: string; handle: string };
  items: { product: { id: string; title: string } }[];
  merchFulfillment: {
    status: "TO_SHIP" | "SHIPPED" | "DELIVERED";
    recipientName: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    shippingFeeKobo: number;
    trackingInfo: string | null;
  } | null;
};

export function CatalogMerchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();
  const [items, setItems] = useState<CatalogMerchItem[] | null>(null);
  const [orders, setOrders] = useState<FulfillmentOrder[] | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    const [itemsData, ordersData] = await Promise.all([
      apiGet<{ products: CatalogMerchItem[] }>("/api/merch", idToken),
      apiGet<{ orders: FulfillmentOrder[] }>("/api/merch/fulfillments", idToken),
    ]);
    setItems(itemsData.products);
    setOrders(ordersData.orders);
  }, [firebaseUser]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    navigation.setOptions({
      title: "Merchandise",
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate("PublishMerch")}>
          <Text style={styles.headerLink}>+ New listing</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  async function handleDelete(id: string) {
    if (!firebaseUser) return;
    Alert.alert(
      "Delete this listing?",
      "It comes off sale and every discovery surface immediately. Anyone who already bought it keeps their copy forever — this is not a refund.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const idToken = await firebaseUser.getIdToken();
            try {
              await apiDelete(`/api/merch/${id}`, idToken);
              load();
            } catch {
              Alert.alert("Could not delete");
            }
          },
        },
      ],
    );
  }

  async function handleMarkShipped(orderId: string) {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    try {
      await apiPatch(`/api/merch/fulfillments/${orderId}`, idToken, { status: "SHIPPED" });
      load();
    } catch {
      Alert.alert("Could not update order");
    }
  }

  if (!items || !orders) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  const toShip = orders.filter((o) => o.merchFulfillment?.status === "TO_SHIP");

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {toShip.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Orders to ship ({toShip.length})</Text>
          {toShip.map((order) => {
            const f = order.merchFulfillment!;
            return (
              <View key={order.id} style={styles.orderCard}>
                <Text style={styles.orderTitle}>{order.items.map((i) => i.product.title).join(", ")}</Text>
                <Text style={styles.orderMeta}>{f.recipientName}</Text>
                <Text style={styles.orderMeta}>
                  {f.addressLine1}
                  {f.addressLine2 ? `, ${f.addressLine2}` : ""}, {f.city}, {f.state}
                </Text>
                <TouchableOpacity style={styles.shipButton} onPress={() => handleMarkShipped(order.id)}>
                  <Text style={styles.shipButtonText}>Mark shipped</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Listings</Text>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>Nothing published yet.</Text>
        ) : (
          items.map((item) => {
            const artwork = item.merchItem?.imageLadder?.["64"];
            const isSoldOut = Boolean(item.stockPolicy?.soldOutAt);
            const cap = item.stockPolicy?.cap ?? null;
            const sold = item.stockPolicy?.sold ?? 0;
            const remaining = cap !== null ? Math.max(cap - sold, 0) : null;
            return (
              <View key={item.id} style={styles.row}>
                {artwork ? <Image source={{ uri: artwork }} style={styles.artwork} /> : <View style={[styles.artwork, styles.artworkPlaceholder]} />}
                <View style={styles.rowInfo}>
                  <TouchableOpacity onPress={() => navigation.navigate("Product", { id: item.id })}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.rowMeta}>
                    {item.status === "DELETED" ? "Deleted · " : ""}
                    {formatNaira(item.priceKobo)} ·{" "}
                    {remaining !== null ? (isSoldOut ? "Sold out" : `${remaining} left`) : `${sold} sold`}
                  </Text>
                </View>
                {item.status !== "DELETED" && (
                  <TouchableOpacity onPress={() => handleDelete(item.id)}>
                    <Text style={styles.deleteLink}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  emptyText: { color: colors.ink3, fontSize: 13 },
  headerLink: { color: colors.redSoft, fontSize: 13, fontWeight: "600" },
  section: { marginBottom: 24 },
  sectionTitle: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10 },
  orderCard: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, gap: 4, marginBottom: 10 },
  orderTitle: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  orderMeta: { color: colors.ink3, fontSize: 12 },
  shipButton: { alignSelf: "flex-start", backgroundColor: colors.red, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginTop: 6 },
  shipButtonText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  artwork: { width: 40, height: 40, borderRadius: 6 },
  artworkPlaceholder: { backgroundColor: colors.surface2 },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  rowMeta: { color: colors.ink3, fontSize: 12, marginTop: 2 },
  deleteLink: { color: colors.ink3, fontSize: 12 },
});
