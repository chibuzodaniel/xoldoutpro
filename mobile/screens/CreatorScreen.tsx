import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiGet } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";
import type { CreatorProfile } from "../lib/creatorTypes";
import { Avatar } from "../components/Avatar";
import { Grid } from "../components/Grid";
import { ProductCard } from "../components/ProductCard";
import { EventCard } from "../components/EventCard";

const HORIZONTAL_PADDING = 16;

export function CreatorScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Creator">>();
  const { handle } = route.params;

  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<CreatorProfile>(`/api/creators/${handle}`)
      .then(setProfile)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [handle]);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const contentWidth = width - HORIZONTAL_PADDING * 2;
  const threeColWidth = (contentWidth - 24) / 3;
  const { user } = profile;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {user.coverUrl ? (
        <Image source={{ uri: user.coverUrl }} style={styles.cover} />
      ) : (
        <View style={styles.cover} />
      )}

      <View style={styles.content}>
        <View style={styles.avatarRow}>
          <Avatar uri={user.avatarUrl} name={user.displayName} index={0} size={72} />
        </View>

        <Text style={styles.name}>{user.displayName}</Text>
        <Text style={styles.handle}>@{user.handle}</Text>
        {user.bio && <Text style={styles.bio}>{user.bio}</Text>}

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{profile.fansCount.toLocaleString("en-NG")}</Text>
            <Text style={styles.statLabel}>FANS</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{profile.totalSold.toLocaleString("en-NG")}</Text>
            <Text style={styles.statLabel}>SALES</Text>
          </View>
        </View>

        {user.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {user.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {profile.catalog.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Catalog</Text>
            <Grid>
              {profile.catalog.map((p) => (
                <TouchableOpacity key={p.id} onPress={() => navigation.navigate("Product", { id: p.id })}>
                  <ProductCard product={p} width={threeColWidth} />
                </TouchableOpacity>
              ))}
            </Grid>
          </View>
        )}

        {profile.events.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Events</Text>
            <Grid>
              {profile.events.map((ev) => (
                <TouchableOpacity key={ev.id} onPress={() => navigation.navigate("Event", { id: ev.id })}>
                  <EventCard event={ev} width={threeColWidth} />
                </TouchableOpacity>
              ))}
            </Grid>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#050505" },
  errorText: { color: "#FF6B7A", fontSize: 14 },
  cover: { width: "100%", height: 100, backgroundColor: "#1a1a1a" },
  content: { paddingHorizontal: HORIZONTAL_PADDING, marginTop: -32 },
  avatarRow: { marginBottom: 10 },
  name: { color: "#fff", fontSize: 20, fontWeight: "700" },
  handle: { color: "#999", fontSize: 13, marginBottom: 8 },
  bio: { color: "#ccc", fontSize: 13, lineHeight: 19, marginBottom: 12, maxWidth: 320 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  statBox: { flex: 1, borderWidth: 1, borderColor: "#222", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  statValue: { color: "#fff", fontSize: 20, fontWeight: "700" },
  statLabel: { color: "#999", fontSize: 10, letterSpacing: 1, marginTop: 2 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  tag: { borderWidth: 1, borderColor: "#333", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  tagText: { color: "#ccc", fontSize: 12 },
  section: { marginTop: 20 },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "600", marginBottom: 10 },
});
