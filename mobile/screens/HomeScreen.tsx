import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiGet } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { DiscoverScreen } from "./DiscoverScreen";

type SearchResultProduct = {
  id: string;
  title: string;
  type: string;
  creator: { displayName: string | null; handle: string };
};

type SearchResponse = { products: SearchResultProduct[]; creators: unknown[] };

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(text: string) {
    setQuery(text);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<SearchResponse>(`/api/search?q=${encodeURIComponent(text)}`);
      setResults(data.products);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  const isSearching = query.trim().length >= 2;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.wordmarkRow}>
          <Image source={require("../assets/icon.png")} style={styles.wordmarkIcon} />
          <Text style={styles.title}>XOLDOUT</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Search releases, beats, merch…"
          placeholderTextColor={colors.ink3}
          value={query}
          onChangeText={runSearch}
          autoCapitalize="none"
        />
      </View>

      {isSearching ? (
        <View style={styles.searchResults}>
          {loading && <ActivityIndicator style={styles.spacer} color={colors.ink} />}
          {error && <Text style={styles.error}>{error}</Text>}
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => navigation.navigate("Product", { id: item.id })}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowSubtitle}>
                  {item.type} · {item.creator.displayName ?? item.creator.handle}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : (
        <DiscoverScreen />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 50 },
  header: { paddingHorizontal: 20 },
  searchResults: { flex: 1, paddingHorizontal: 20 },
  wordmarkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  wordmarkIcon: { width: 22, height: 22, borderRadius: 5 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "800", letterSpacing: -0.3 },
  input: {
    backgroundColor: colors.surface2,
    color: colors.ink,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  spacer: { marginVertical: 8 },
  error: { color: colors.red, marginBottom: 8 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  rowTitle: { color: colors.ink, fontSize: 16 },
  rowSubtitle: { color: colors.ink3, fontSize: 13, marginTop: 2 },
});
