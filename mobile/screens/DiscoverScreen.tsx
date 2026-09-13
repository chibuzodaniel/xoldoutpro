import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  StyleSheet,
} from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { apiGet } from "../lib/api";
import type { DiscoverData } from "../lib/discoverTypes";
import type { RootStackParamList } from "../lib/navigation";
import { colors, fonts } from "../lib/theme";
import { Avatar } from "../components/Avatar";
import { EventCard } from "../components/EventCard";
import { Grid } from "../components/Grid";
import { HeroCard } from "../components/HeroCard";
import { ProductCard } from "../components/ProductCard";

const HORIZONTAL_PADDING = 16;
const RAIL_WIDTH = 96;

function columnWidth(columns: number, contentWidth: number, gap = 12) {
  return (contentWidth - gap * (columns - 1)) / columns;
}

export function DiscoverScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const contentWidth = width - HORIZONTAL_PADDING * 2;
  const threeColWidth = columnWidth(3, contentWidth);
  const newReleaseAreaWidth = contentWidth - RAIL_WIDTH - 12;
  const twoColWidth = columnWidth(2, newReleaseAreaWidth);

  const [data, setData] = useState<DiscoverData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      setError(null);
      const result = await apiGet<DiscoverData>("/api/discover");
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!data && !error) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={load} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const d = data!;
  const newReleasesCapped = d.newReleasesBelowHero.slice(0, 4);
  const topCreatorsCapped = d.weeklyTopCreators.slice(0, 3);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl tintColor={colors.ink} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {d.hero && (
        <TouchableOpacity onPress={() => navigation.navigate("Product", { id: d.hero!.id })} activeOpacity={0.9}>
          <HeroCard hero={d.hero} heroWeeklySold={d.heroWeeklySold} />
        </TouchableOpacity>
      )}

      {newReleasesCapped.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabelRed}>NEW RELEASE</Text>
          <View style={styles.newReleaseRow}>
            <View style={[styles.grid2Col, { width: newReleaseAreaWidth, gap: 12 }]}>
              {newReleasesCapped.map((p) => (
                <TouchableOpacity key={p.id} onPress={() => navigation.navigate("Product", { id: p.id })}>
                  <ProductCard product={p} width={twoColWidth} />
                </TouchableOpacity>
              ))}
            </View>

            {topCreatorsCapped.length > 0 && (
              <View style={styles.rail}>
                <Text style={styles.railLabel}>TOP THIS WEEK</Text>
                <View style={styles.railItems}>
                  {topCreatorsCapped.map((c, i) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.railItem}
                      onPress={() => navigation.navigate("Creator", { handle: c.handle })}
                    >
                      <View style={styles.railAvatarWrap}>
                        <Text style={styles.railRank}>{i + 1}</Text>
                        <Avatar uri={c.avatarUrl} name={c.displayName} index={i} size={64} />
                      </View>
                      <Text style={styles.railName} numberOfLines={1}>
                        {c.displayName}
                      </Text>
                      <Text style={styles.railMetric}>{c.metric}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recommended For You</Text>
        {d.recommended.length === 0 ? (
          <Text style={styles.emptyText}>Nothing published yet.</Text>
        ) : (
          <Grid>
            {d.recommended.map((p) => (
              <TouchableOpacity key={p.id} onPress={() => navigation.navigate("Product", { id: p.id })}>
                <ProductCard product={p} width={threeColWidth} />
              </TouchableOpacity>
            ))}
          </Grid>
        )}
      </View>

      {d.topBeats.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Beat Store</Text>
          <Grid>
            {d.topBeats.map((p) => (
              <TouchableOpacity key={p.id} onPress={() => navigation.navigate("Product", { id: p.id })}>
                <ProductCard product={p} width={threeColWidth} />
              </TouchableOpacity>
            ))}
          </Grid>
        </View>
      )}

      {d.upcomingEvents.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Events</Text>
          <Grid>
            {d.upcomingEvents.map((ev) => (
              <TouchableOpacity key={ev.id} onPress={() => navigation.navigate("Event", { id: ev.id })}>
                <EventCard event={ev} width={threeColWidth} />
              </TouchableOpacity>
            ))}
          </Grid>
        </View>
      )}

      {d.merchItems.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Merchandise</Text>
          <Grid>
            {d.merchItems.map((p) => (
              <TouchableOpacity key={p.id} onPress={() => navigation.navigate("Product", { id: p.id })}>
                <ProductCard product={p} width={threeColWidth} />
              </TouchableOpacity>
            ))}
          </Grid>
        </View>
      )}

      {d.creators.length > 0 && (
        <View style={[styles.section, { marginBottom: 32 }]}>
          <Text style={styles.sectionTitle}>Featured Creators</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.featuredRow}>
              {d.creators.map((c, i) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.featuredItem}
                  onPress={() => navigation.navigate("Creator", { handle: c.handle })}
                >
                  <Avatar uri={c.avatarUrl} name={c.displayName} index={i} size={56} />
                  <Text style={styles.featuredName} numberOfLines={1}>
                    {c.displayName}
                  </Text>
                  <Text style={styles.featuredFollowers}>{c._count.followers}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingHorizontal: HORIZONTAL_PADDING, paddingTop: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 12 },
  errorText: { color: colors.redSoft, fontSize: 14 },
  retryButton: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface2, borderRadius: 8 },
  retryText: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  section: { marginTop: 20 },
  sectionLabelRed: { color: colors.redSoft, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginBottom: 10 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontFamily: fonts.serif, marginBottom: 10 },
  emptyText: { color: colors.ink3, fontSize: 13 },
  newReleaseRow: { flexDirection: "row", gap: 12, alignItems: "stretch" },
  grid2Col: { flexDirection: "row", flexWrap: "wrap" },
  rail: { width: RAIL_WIDTH, flexDirection: "column" },
  railLabel: { color: colors.ink3, fontSize: 9.5, fontWeight: "600", letterSpacing: 0.5, marginBottom: 10 },
  railItems: { flex: 1, flexDirection: "column", justifyContent: "space-between", gap: 14 },
  railItem: {},
  railAvatarWrap: { position: "relative", marginBottom: 6, width: 64 },
  railRank: {
    position: "absolute",
    left: -6,
    top: -10,
    fontSize: 40,
    fontWeight: "900",
    color: "rgba(255,255,255,0.1)",
    zIndex: -1,
  },
  railName: { color: colors.ink2, fontSize: 10, fontWeight: "600" },
  railMetric: { color: colors.ink3, fontSize: 9 },
  featuredRow: { flexDirection: "row", gap: 16 },
  featuredItem: { alignItems: "center", width: 64 },
  featuredName: { color: colors.ink2, fontSize: 10.5, fontWeight: "500", marginTop: 6, textAlign: "center" },
  featuredFollowers: { color: colors.ink3, fontSize: 10, marginTop: 2 },
});
