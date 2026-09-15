import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from "@react-navigation/native";
import { apiGet } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import type { FeedPost, FollowedCreator } from "../lib/socialTypes";
import type { RootStackParamList } from "../lib/navigation";
import type { BottomTabParamList } from "../lib/tabNavigation";
import { colors, fonts } from "../lib/theme";
import { PostCard } from "../components/social/PostCard";
import { PostComposer } from "../components/social/PostComposer";
import { FanbaseTab } from "../components/fanbase/FanbaseTab";

const TABS = [
  { key: "feed", label: "Feed" },
  { key: "fanbase", label: "Fanbase" },
] as const;
type SocialsTab = (typeof TABS)[number]["key"];

const FEED_MODES = [
  { key: "forYou", label: "For You" },
  { key: "following", label: "Following" },
] as const;
type FeedMode = (typeof FEED_MODES)[number]["key"];

export function SocialsScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList & BottomTabParamList>>();
  const route = useRoute<RouteProp<BottomTabParamList, "Socials">>();
  const { appUser, firebaseUser, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<SocialsTab>("feed");
  const [feedMode, setFeedMode] = useState<FeedMode>("forYou");
  const [following, setFollowing] = useState<FollowedCreator[] | null>(null);
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  // The central "Drop" FAB opens the composer directly (instead of the
  // general Publish hub) when it's tapped while already on Socials — mirrors
  // web's BottomNav.tsx (`/socials?compose=1`). Clears the param right after
  // so navigating back here later doesn't reopen it.
  useEffect(() => {
    if (route.params?.compose) {
      setComposerOpen(true);
      navigation.setParams({ compose: undefined });
    }
  }, [route.params?.compose, navigation]);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    setPosts(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      const data = await apiGet<{ following: FollowedCreator[]; posts: FeedPost[] }>(
        feedMode === "forYou" ? "/api/posts?feed=forYou" : "/api/posts",
        idToken,
      );
      setFollowing(data.following);
      setPosts(data.posts);
    } catch {
      setPosts([]);
    }
  }, [firebaseUser, feedMode]);

  useEffect(() => {
    load();
  }, [load]);

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (!appUser) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Sign in to use Socials</Text>
        <TouchableOpacity style={styles.signInButton} onPress={() => navigation.navigate("Profile")}>
          <Text style={styles.signInButtonText}>Go to Profile</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Socials</Text>
        <View style={styles.tabsRow}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={styles.tabButton}>
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
              {tab === t.key && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {tab === "fanbase" ? (
        <FanbaseTab />
      ) : (
        <FlatList
          style={styles.container}
          contentContainerStyle={styles.feedContent}
          data={posts ?? []}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={
            <>
              <View style={styles.feedModeRow}>
                {FEED_MODES.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.feedModeButton, feedMode === m.key && styles.feedModeButtonActive]}
                    onPress={() => setFeedMode(m.key)}
                  >
                    <Text style={[styles.feedModeText, feedMode === m.key && styles.feedModeTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {feedMode === "following" && following && following.length > 0 && (
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={following}
                  keyExtractor={(c) => c.id}
                  contentContainerStyle={styles.followingRow}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.followingItem}
                      onPress={() => navigation.navigate("Creator", { handle: item.handle })}
                    >
                      {item.avatarUrl ? (
                        <Image source={{ uri: item.avatarUrl }} style={styles.followingAvatar} />
                      ) : (
                        <View style={[styles.followingAvatar, styles.followingAvatarPlaceholder]} />
                      )}
                      <Text style={styles.followingName} numberOfLines={1}>
                        {item.displayName}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              )}

              {posts === null && (
                <View style={styles.centeredInline}>
                  <ActivityIndicator color={colors.ink} />
                </View>
              )}
              {posts !== null && posts.length === 0 && (
                <Text style={styles.emptyText}>
                  {feedMode === "forYou"
                    ? "Nothing to discover yet — check back once more creators start posting."
                    : "Announcements from creators you follow will show up here once you start following someone."}
                </Text>
              )}
            </>
          }
          renderItem={({ item }) => (
            <View style={styles.postWrap}>
              <PostCard post={item} onDeleted={(id) => setPosts((cur) => cur?.filter((p) => p.id !== id) ?? null)} />
            </View>
          )}
        />
      )}

      {tab === "feed" && (
        <TouchableOpacity style={styles.fab} onPress={() => setComposerOpen(true)}>
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>
      )}

      <PostComposer
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
        onPosted={(post) => setPosts((cur) => [post, ...(cur ?? [])])}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 12 },
  centeredInline: { paddingVertical: 40, alignItems: "center" },
  emptyTitle: { color: colors.ink, fontSize: 15 },
  signInButton: { backgroundColor: colors.red, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12 },
  signInButtonText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  header: { paddingHorizontal: 16, paddingTop: 50 },
  pageTitle: { color: colors.ink, fontSize: 24, fontFamily: fonts.serif, marginBottom: 16 },
  tabsRow: { flexDirection: "row", gap: 20, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  tabButton: { paddingBottom: 10 },
  tabLabel: { color: colors.ink3, fontSize: 14, fontWeight: "600" },
  tabLabelActive: { color: colors.ink },
  tabUnderline: { height: 2, backgroundColor: colors.red, marginTop: 8, borderRadius: 1 },
  feedContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
  feedModeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  feedModeButton: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: colors.surface2 },
  feedModeButtonActive: { backgroundColor: colors.red },
  feedModeText: { color: colors.ink3, fontSize: 12, fontWeight: "600" },
  feedModeTextActive: { color: colors.ink },
  followingRow: { gap: 16, paddingBottom: 20 },
  followingItem: { alignItems: "center", width: 56 },
  followingAvatar: { width: 48, height: 48, borderRadius: 24 },
  followingAvatarPlaceholder: { backgroundColor: colors.surface2 },
  followingName: { color: colors.ink3, fontSize: 10.5, marginTop: 4, textAlign: "center" },
  emptyText: { color: colors.ink3, fontSize: 13, lineHeight: 19 },
  postWrap: { marginBottom: 12 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.red,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabIcon: { color: colors.ink, fontSize: 26, fontWeight: "300", marginTop: -2 },
});
