import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiGet } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";
import type { WeeklyTopCreator } from "../lib/discoverTypes";
import { colors, fonts } from "../lib/theme";
import { Avatar } from "../components/Avatar";

export function TopCreatorsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [creators, setCreators] = useState<WeeklyTopCreator[] | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: "Top This Week" });
  }, [navigation]);

  useEffect(() => {
    apiGet<{ creators: WeeklyTopCreator[] }>("/api/discover/top-creators").then((d) => setCreators(d.creators));
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!creators ? (
        <ActivityIndicator style={styles.spinner} color={colors.ink} />
      ) : creators.length === 0 ? (
        <Text style={styles.emptyText}>Nothing to show yet.</Text>
      ) : (
        creators.map((c, i) => (
          <TouchableOpacity key={c.id} style={styles.row} onPress={() => navigation.navigate("Creator", { handle: c.handle })}>
            <Text style={styles.rank}>{i + 1}</Text>
            <Avatar uri={c.avatarUrl} name={c.displayName} index={i} size={48} />
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>
                {c.displayName}
              </Text>
              <Text style={styles.metric}>{c.metric}</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  spinner: { marginTop: 40 },
  emptyText: { color: colors.ink3, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rank: { width: 20, textAlign: "center", color: colors.ink3, fontSize: 13, fontWeight: "900" },
  info: { flex: 1, minWidth: 0 },
  name: { color: colors.ink2, fontSize: 14, fontFamily: fonts.serif },
  metric: { color: colors.ink3, fontSize: 12, marginTop: 1 },
});
