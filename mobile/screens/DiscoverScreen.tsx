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
import type { BillboardSlide } from "../lib/billboardTypes";
import type { RootStackParamList } from "../lib/navigation";
import { colors, fonts } from "../lib/theme";
import { Avatar } from "../components/Avatar";
import { EventCard } from "../components/EventCard";
import { Grid } from "../components/Grid";
import { HeroCard } from "../components/HeroCard";
import { ProductCard } from "../components/ProductCard";
import { BillboardRail } from "../components/BillboardRail";
import { CategoryTabs, type CategoryType } from "../components/CategoryTabs";

const HORIZONTAL_PADDING = 16;
const RAIL_WIDTH = 96;
const TOP_CREATORS_RAIL_COUNT = 5;

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
  const [billboards, setBillboards] = useState<BillboardSlide[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      setError(null);
      const [result, billboardRes] = await Promise.all([
        apiGet<DiscoverData>("/api/discover"),
        apiGet<{ billboards: BillboardSlide[] }>("/api/billboards/active").catch(() => ({ billboards: [] })),
      ]);
      setData(result);
      setBillboards(billboardRes.billboards);
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

  function handleCategorySelect(type: CategoryType) {
    if (type) navigation.navigate("DiscoverCategory", { type });
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
  const topCreatorsCapped = d.weeklyTopCreators.slice(0, TOP_CREATORS_RAIL_COUNT);

  return (
    <View style={styles.root}>
      <CategoryTabs active={null} onSelect={handleCategorySelect} />
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

        {(newReleasesCapped.length > 0 || billboards.length > 0) && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabelRed}>NEW RELEASE</Text>
              {d.newReleasesBelowHero.length > 4 && (
                <TouchableOpacity onPress={() => navigation.navigate("DiscoverCategory", { type: "RELEASE" })}>
                  <Text style={styles.viewAllRed}>View all ›</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.newReleaseRow}>
              <View style={[styles.newReleaseCol, { width: newReleaseAreaWidth }]}>
                <View style={styles.grid2Col}>
                  {newReleasesCapped.map((p) => (
                    <TouchableOpacity key={p.id} onPress={() => navigation.navigate("Product", { id: p.id })}>
                      <ProductCard product={p} width={twoColWidth} />
                    </TouchableOpacity>
                  ))}
                </View>
                {/* Nested here, not a separate section — mirrors web's
                    BillboardRail placement: it sits inside the New Release
                    row's left column so the Top sellers rail alongside
                    naturally stretches to match (items-stretch on web). */}
                <BillboardRail slides={billboards} width={newReleaseAreaWidth} />
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
                  {d.weeklyTopCreators.length > TOP_CREATORS_RAIL_COUNT && (
                    <TouchableOpacity onPress={() => navigation.navigate("TopCreators")}>
                      <Text style={styles.railViewAll}>View all ›</Text>
                    </TouchableOpacity>
                  )}
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
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Beat Store</Text>
              <TouchableOpacity onPress={() => navigation.navigate("DiscoverCategory", { type: "BEAT" })}>
                <Text style={styles.viewAllRed}>Browse ›</Text>
              </TouchableOpacity>
            </View>
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
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Events</Text>
              <TouchableOpacity onPress={() => navigation.navigate("DiscoverCategory", { type: "EVENT" })}>
                <Text style={styles.viewAllRed}>See all ›</Text>
              </TouchableOpacity>
            </View>
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
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Merchandise</Text>
              <TouchableOpacity onPress={() => navigation.navigate("DiscoverCategory", { type: "MERCH" })}>
                <Text style={styles.viewAllRed}>Shop all ›</Text>
              </TouchableOpacity>
            </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingHorizontal: HORIZONTAL_PADDING, paddingTop: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 12 },
  errorText: { color: colors.redSoft, fontSize: 14 },
  retryButton: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface2, borderRadius: 8 },
  retryText: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  section: { marginTop: 20 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionLabelRed: { color: colors.redSoft, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontFamily: fonts.serif },
  viewAllRed: { color: colors.redSoft, fontSize: 12, fontWeight: "600" },
  emptyText: { color: colors.ink3, fontSize: 13 },
  newReleaseRow: { flexDirection: "row", gap: 12, alignItems: "stretch" },
  newReleaseCol: { flexDirection: "column", gap: 12 },
  grid2Col: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
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
  railViewAll: { color: colors.redSoft, fontSize: 9, fontWeight: "600", marginTop: 10, textAlign: "center" },
  featuredRow: { flexDirection: "row", gap: 16 },
  featuredItem: { alignItems: "center", width: 64 },
  featuredName: { color: colors.ink2, fontSize: 10.5, fontWeight: "500", marginTop: 6, textAlign: "center" },
  featuredFollowers: { color: colors.ink3, fontSize: 10, marginTop: 2 },
});
