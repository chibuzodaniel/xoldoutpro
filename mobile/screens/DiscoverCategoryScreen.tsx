import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, StyleSheet, useWindowDimensions } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiGet } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";
import type { ProductCardData, EventData } from "../lib/discoverTypes";
import { colors } from "../lib/theme";
import { CategoryTabs, type CategoryType } from "../components/CategoryTabs";
import { Grid } from "../components/Grid";
import { ProductCard } from "../components/ProductCard";
import { EventCard } from "../components/EventCard";

const SECTION_TITLE: Record<"RELEASE" | "BEAT" | "EVENT" | "MERCH", string> = {
  RELEASE: "Music",
  BEAT: "Beats",
  EVENT: "Events",
  MERCH: "Merchandise",
};

type CategoryResponse =
  | { category: { type: "EVENT"; events: EventData[] } }
  | { category: { type: "RELEASE" | "BEAT" | "MERCH"; products: ProductCardData[] } };

const HORIZONTAL_PADDING = 16;

export function DiscoverCategoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "DiscoverCategory">>();
  const { width } = useWindowDimensions();
  const threeColWidth = (width - HORIZONTAL_PADDING * 2 - 24) / 3;
  const type = route.params.type;

  const [data, setData] = useState<CategoryResponse["category"] | null>(null);

  useEffect(() => {
    setData(null);
    apiGet<CategoryResponse>(`/api/discover?type=${type}`).then((res) => setData(res.category));
  }, [type]);

  useEffect(() => {
    navigation.setOptions({ title: SECTION_TITLE[type] });
  }, [navigation, type]);

  function handleSelect(next: CategoryType) {
    if (next === null) {
      navigation.goBack();
    } else {
      navigation.setParams({ type: next });
    }
  }

  const items = data ? (data.type === "EVENT" ? data.events : data.products) : null;

  return (
    <View style={styles.container}>
      <CategoryTabs active={type} onSelect={handleSelect} />
      <ScrollView contentContainerStyle={styles.content}>
        {!items ? (
          <ActivityIndicator style={styles.spinner} color={colors.ink} />
        ) : items.length === 0 ? (
          <Text style={styles.emptyText}>Nothing published yet.</Text>
        ) : (
          <Grid>
            {data!.type === "EVENT"
              ? data!.events.map((ev) => (
                  <TouchableOpacity key={ev.id} onPress={() => navigation.navigate("Event", { id: ev.id })}>
                    <EventCard event={ev} width={threeColWidth} />
                  </TouchableOpacity>
                ))
              : data!.products.map((p) => (
                  <TouchableOpacity key={p.id} onPress={() => navigation.navigate("Product", { id: p.id })}>
                    <ProductCard product={p} width={threeColWidth} />
                  </TouchableOpacity>
                ))}
          </Grid>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: HORIZONTAL_PADDING, paddingBottom: 40 },
  spinner: { marginTop: 40 },
  emptyText: { color: colors.ink3, fontSize: 13 },
});
