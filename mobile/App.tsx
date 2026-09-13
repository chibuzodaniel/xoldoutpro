import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiGet } from "./lib/api";
import { DiscoverScreen } from "./screens/DiscoverScreen";

type SearchResultProduct = {
  id: string;
  title: string;
  type: string;
  creator: { displayName: string | null; handle: string };
};

type SearchResponse = { products: SearchResultProduct[]; creators: unknown[] };

export default function App() {
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
        <Text style={styles.title}>XOLDOUT</Text>
        <TextInput
          style={styles.input}
          placeholder="Search releases, beats, merch…"
          placeholderTextColor="#666"
          value={query}
          onChangeText={runSearch}
          autoCapitalize="none"
        />
      </View>

      {isSearching ? (
        <View style={styles.searchResults}>
          {loading && <ActivityIndicator style={styles.spacer} color="#fff" />}
          {error && <Text style={styles.error}>{error}</Text>}
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowSubtitle}>
                  {item.type} · {item.creator.displayName ?? item.creator.handle}
                </Text>
              </View>
            )}
          />
        </View>
      ) : (
        <DiscoverScreen />
      )}

      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505", paddingTop: 60 },
  header: { paddingHorizontal: 20 },
  searchResults: { flex: 1, paddingHorizontal: 20 },
  title: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 16 },
  input: {
    backgroundColor: "#1a1a1a",
    color: "#fff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  spacer: { marginVertical: 8 },
  error: { color: "#FF2D42", marginBottom: 8 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#222" },
  rowTitle: { color: "#fff", fontSize: 16 },
  rowSubtitle: { color: "#999", fontSize: 13, marginTop: 2 },
});
