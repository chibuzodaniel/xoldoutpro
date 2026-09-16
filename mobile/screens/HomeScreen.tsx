import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation, useIsFocused, type NavigationProp } from "@react-navigation/native";
import { apiGet } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { AppLogoHeader } from "../components/AppLogoHeader";
import { BellIcon } from "../components/NavIcons";
import { DiscoverScreen } from "./DiscoverScreen";

type SearchResultProduct = {
  id: string;
  title: string;
  type: string;
  creator: { displayName: string | null; handle: string };
};

type SearchResponse = { products: SearchResultProduct[]; creators: unknown[] };

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const { firebaseUser } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isFocused || !firebaseUser) return;
    firebaseUser
      .getIdToken()
      .then((idToken) => apiGet<{ unreadCount: number }>("/api/notifications", idToken))
      .then((data) => setUnreadCount(data.unreadCount))
      .catch(() => {});
  }, [isFocused, firebaseUser]);

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
          <AppLogoHeader
            right={
              <TouchableOpacity style={styles.bellButton} onPress={() => navigation.navigate("Notifications")}>
                <BellIcon color={colors.ink2} />
                {unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            }
          />
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
  wordmarkRow: { marginBottom: 16 },
  bellButton: { position: "relative", padding: 4 },
  unreadBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  unreadBadgeText: { color: colors.ink, fontSize: 9, fontWeight: "700" },
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
