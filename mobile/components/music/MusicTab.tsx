import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet, useWindowDimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiGet } from "../../lib/api";
import type { RootStackParamList } from "../../lib/navigation";
import type { ProductCardData } from "../../lib/discoverTypes";
import { GENRES, MOODS, genreLabel, moodLabel } from "../../lib/musicTags";
import { useOwnedProducts } from "../../lib/useOwnedProducts";
import { colors, fonts } from "../../lib/theme";
import { Grid } from "../Grid";
import { ProductCard } from "../ProductCard";

type Sort = "new" | "top" | "free";

const SORT_TILES: { sort: Sort; title: string; blurb: string; badge: string; icon: string }[] = [
  { sort: "new", title: "New Releases", blurb: "Fresh drops from your favourite artists", badge: "NEW", icon: "✦" },
  { sort: "top", title: "Top Selling", blurb: "Most bought tracks & albums", badge: "", icon: "♛" },
  { sort: "free", title: "Free Songs", blurb: "Great music. No cost.", badge: "FREE", icon: "♫" },
];

const PADDING = 16;

// Mirrors web's components/music/MusicTab.tsx (V1.2, explicit ask
// 2026-10-21): search, genre and mood chips, New Releases / Top Selling /
// Free Songs tiles, and the results grid — same /api/discover?type=RELEASE
// filters as the website. Fetched once per filter change, never polled.
export function MusicTab({ initialGenre, initialMood }: { initialGenre?: string; initialMood?: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const tileWidth = (width - PADDING * 2 - 24) / 3;
  const [genre, setGenre] = useState<string | null>(initialGenre ?? null);
  const [mood, setMood] = useState<string | null>(initialMood ?? null);
  const [sort, setSort] = useState<Sort>("new");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<ProductCardData[] | null>(null);
  const ownedIds = useOwnedProducts(products ? products.map((p) => p.id) : []);

  useEffect(() => {
    setGenre(initialGenre ?? null);
    setMood(initialMood ?? null);
  }, [initialGenre, initialMood]);

  useEffect(() => {
    let cancelled = false;
    setProducts(null);
    const params = new URLSearchParams({ type: "RELEASE" });
    if (genre) params.set("genre", genre);
    if (mood) params.set("mood", mood);
    if (sort !== "new") params.set("sort", sort);
    if (q) params.set("q", q);
    apiGet<{ category: { products: ProductCardData[] } }>(`/api/discover?${params.toString()}`)
      .then((res) => !cancelled && setProducts(res.category.products))
      .catch(() => !cancelled && setProducts([]));
    return () => {
      cancelled = true;
    };
  }, [genre, mood, sort, q]);

  const activeTile = SORT_TILES.find((t) => t.sort === sort)!;
  const filterBits = [genre && genreLabel(genre), mood && moodLabel(mood), q && `“${q}”`].filter(Boolean);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Music</Text>
      <Text style={styles.tagline}>Discover. Support. Own.</Text>

      <TextInput
        value={qInput}
        onChangeText={setQInput}
        onSubmitEditing={() => setQ(qInput.trim())}
        returnKeyType="search"
        placeholder="Search artist, song, genre…"
        placeholderTextColor={colors.ink3}
        style={styles.search}
      />

      <Text style={styles.label}>Genres</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={styles.chipScroll}>
        <Chip label="All" active={!genre} onPress={() => setGenre(null)} />
        {GENRES.map((g) => (
          <Chip key={g.slug} label={g.label} active={genre === g.slug} onPress={() => setGenre(genre === g.slug ? null : g.slug)} />
        ))}
      </ScrollView>

      <Text style={styles.label}>Mood</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={styles.chipScroll}>
        {MOODS.map((m) => (
          <Chip key={m.slug} label={`${m.icon} ${m.label}`} active={mood === m.slug} onPress={() => setMood(mood === m.slug ? null : m.slug)} />
        ))}
      </ScrollView>

      <View style={styles.tiles}>
        {SORT_TILES.map((t) => (
          <TouchableOpacity key={t.sort} style={[styles.tile, sort === t.sort && styles.tileActive]} onPress={() => setSort(t.sort)}>
            {t.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t.badge}</Text>
              </View>
            ) : (
              <Text style={styles.tileIcon}>{t.icon}</Text>
            )}
            <View>
              <Text style={styles.tileTitle}>{t.title}</Text>
              <Text style={styles.tileBlurb} numberOfLines={2}>
                {t.blurb}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{activeTile.title}</Text>
        {activeTile.badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{activeTile.badge}</Text>
          </View>
        ) : null}
        {filterBits.length > 0 && (
          <Text style={styles.filters} numberOfLines={1}>
            · {filterBits.join(" · ")}
          </Text>
        )}
      </View>

      {!products ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.ink} />
      ) : products.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No songs here yet.</Text>
          {filterBits.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setGenre(null);
                setMood(null);
                setQ("");
                setQInput("");
              }}
            >
              <Text style={styles.clear}>Clear filters</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <Grid>
          {products.map((p) => (
            <TouchableOpacity key={p.id} onPress={() => navigation.navigate("Product", { id: p.id })}>
              <ProductCard product={p} width={tileWidth} owned={ownedIds.has(p.id)} />
            </TouchableOpacity>
          ))}
        </Grid>
      )}
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: { padding: PADDING, paddingBottom: 40 },
  heading: { color: colors.ink, fontSize: 34, fontFamily: fonts.serif },
  tagline: { color: colors.ink3, fontSize: 13, marginTop: 2, marginBottom: 14 },
  search: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
    marginBottom: 18,
  },
  label: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 },
  chipScroll: { marginHorizontal: -PADDING, marginBottom: 16 },
  chipRow: { paddingHorizontal: PADDING, gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipActive: { backgroundColor: colors.red, borderColor: colors.red },
  chipText: { color: colors.ink2, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  tiles: { flexDirection: "row", gap: 8, marginBottom: 22 },
  tile: {
    flex: 1,
    minHeight: 118,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: 12,
    padding: 10,
    justifyContent: "space-between",
    backgroundColor: "rgba(225,29,46,0.12)",
  },
  tileActive: { borderColor: colors.red },
  tileIcon: { color: colors.redSoft, fontSize: 17 },
  tileTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.serif },
  tileBlurb: { color: colors.ink3, fontSize: 10, marginTop: 2, lineHeight: 13 },
  badge: { alignSelf: "flex-start", backgroundColor: colors.red, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitle: { color: colors.ink, fontSize: 20, fontFamily: fonts.serif },
  filters: { color: colors.ink3, fontSize: 12, flexShrink: 1 },
  empty: { borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 12, padding: 20, alignItems: "center", gap: 4 },
  emptyText: { color: colors.ink2, fontSize: 13 },
  clear: { color: colors.redSoft, fontSize: 12, fontWeight: "600" },
});
