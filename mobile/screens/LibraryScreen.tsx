import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  StyleSheet,
} from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import QRCode from "react-native-qrcode-svg";
import { API_BASE_URL, apiGet, apiPatch } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { usePlayer } from "../lib/PlayerContext";
import type { PlayableTrack } from "../lib/playerTypes";
import type { LibraryEntitlement, LibraryTrack } from "../lib/libraryTypes";
import type { BottomTabParamList } from "../lib/tabNavigation";
import { colors, fonts } from "../lib/theme";
import { ActionSheet } from "../components/ActionSheet";

const HORIZONTAL_PADDING = 16;

const FULFILLMENT_LABEL: Record<"TO_SHIP" | "SHIPPED" | "DELIVERED", string> = {
  TO_SHIP: "Preparing to ship",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

function artworkUrl(release: LibraryEntitlement["product"]["release"]) {
  return release?.artworkLadder?.["1024"] ?? null;
}
function beatCoverUrl(beat: LibraryEntitlement["product"]["beat"]) {
  return beat?.coverImageLadder?.["1024"] ?? null;
}
function merchImageUrl(merchItem: LibraryEntitlement["product"]["merchItem"]) {
  return merchItem?.imageLadder?.["64"] ?? null;
}

function buildPlayable(e: LibraryEntitlement): PlayableTrack[] {
  if (e.product.release) {
    return e.product.release.tracks.map((t) => ({
      trackId: t.id,
      title: t.title,
      artistName: e.product.creator.displayName,
      artworkUrl: artworkUrl(e.product.release),
      productId: e.product.id,
      kind: "track",
    }));
  }
  if (e.product.beat) {
    return [
      {
        trackId: e.product.id,
        title: e.product.title,
        artistName: e.product.creator.displayName,
        artworkUrl: beatCoverUrl(e.product.beat),
        productId: e.product.id,
        kind: "beat",
      },
    ];
  }
  return [];
}

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export function LibraryScreen() {
  const navigation = useNavigation<NavigationProp<BottomTabParamList>>();
  const { firebaseUser, appUser, loading: authLoading } = useAuth();
  const player = usePlayer();
  const { width } = useWindowDimensions();

  const [entitlements, setEntitlements] = useState<LibraryEntitlement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<LibraryEntitlement | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      setError(null);
      const idToken = await firebaseUser.getIdToken();
      const data = await apiGet<{ entitlements: LibraryEntitlement[] }>("/api/library", idToken);
      setEntitlements(data.entitlements);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [firebaseUser]);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function handlePlayTap(e: LibraryEntitlement) {
    if (player.current?.productId === e.product.id) {
      if (!player.isPlaying) player.togglePlay();
      return;
    }
    const queue = buildPlayable(e);
    if (queue.length === 0) return;
    player.play(queue[0], queue);
  }

  function handleTitleTap(e: LibraryEntitlement) {
    if (e.product.release) setExpandedId((cur) => (cur === e.id ? null : e.id));
    else handlePlayTap(e);
  }

  async function handleShare(e: LibraryEntitlement) {
    const path = e.product.release ? `/r/${e.product.id}` : `/b/${e.product.id}`;
    try {
      await Share.share({ message: `${e.product.title} — ${e.product.creator.displayName} on XOLDOUT\n${API_BASE_URL}${path}` });
    } catch {
      // user dismissed the share sheet
    }
  }

  function handleShuffle(e: LibraryEntitlement) {
    const tracks = buildPlayable(e);
    if (tracks.length < 2) return;
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    player.play(shuffled[0], shuffled);
  }

  function handlePlayNext(e: LibraryEntitlement) {
    const tracks = buildPlayable(e);
    if (tracks.length === 0) return;
    player.playNext(tracks);
  }

  async function handleTogglePin(e: LibraryEntitlement) {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    try {
      await apiPatch("/api/library", idToken, { entitlementId: e.id, pinned: !e.pinnedAt });
      await load();
    } catch {
      // best-effort — the sheet already closed, no inline error surface here
    }
  }

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
        <Text style={styles.emptyTitle}>Sign in to see your library</Text>
        <TouchableOpacity style={styles.signInButton} onPress={() => navigation.navigate("Profile")}>
          <Text style={styles.signInButtonText}>Go to Profile</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.signInButton} onPress={load}>
          <Text style={styles.signInButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (entitlements === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  const musicItems = entitlements.filter((e) => e.product.release || e.product.beat);
  const ticketItems = entitlements.filter((e) => e.product.ticketTier);
  const merchItems = entitlements.filter((e) => e.product.merchItem);
  const cardWidth = (width - HORIZONTAL_PADDING * 2 - 16) / 2;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl tintColor={colors.ink} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.pageTitle}>Library</Text>

      {entitlements.length === 0 ? (
        <Text style={styles.emptyText}>Everything you buy shows up here. Nothing yet.</Text>
      ) : (
        <>
          {musicItems.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>MUSIC & BEATS</Text>
              <View style={styles.grid}>
                {musicItems.map((e) => {
                  const art = e.product.release ? artworkUrl(e.product.release) : beatCoverUrl(e.product.beat);
                  const isThisPlaying = player.isPlaying && player.current?.productId === e.product.id;
                  return (
                    <View key={e.id} style={{ width: cardWidth }}>
                      <TouchableOpacity
                        style={[styles.artBox, { width: cardWidth, height: cardWidth }]}
                        onPress={() => handlePlayTap(e)}
                        onLongPress={() => setActionsFor(e)}
                      >
                        {art ? <Image source={{ uri: art }} style={styles.art} /> : <View style={[styles.art, styles.artPlaceholder]} />}
                        {e.pinnedAt && (
                          <View style={styles.pinBadge}>
                            <Text style={styles.pinBadgeText}>📌</Text>
                          </View>
                        )}
                        {isThisPlaying && (
                          <View style={styles.playingBadge}>
                            <Text style={styles.playingBadgeText}>♫</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleTitleTap(e)}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {e.product.title}
                        </Text>
                        <Text style={styles.cardSubtitle} numberOfLines={1}>
                          {e.product.creator.displayName}
                        </Text>
                      </TouchableOpacity>

                      {expandedId === e.id && e.product.release && (
                        <View style={styles.trackList}>
                          {e.product.release.tracks.map((t: LibraryTrack) => {
                            const isThisTrack = player.current?.trackId === t.id;
                            return (
                              <TouchableOpacity
                                key={t.id}
                                style={styles.trackRow}
                                onPress={() =>
                                  player.play(
                                    {
                                      trackId: t.id,
                                      title: t.title,
                                      artistName: e.product.creator.displayName,
                                      artworkUrl: art,
                                      productId: e.product.id,
                                      kind: "track",
                                    },
                                    buildPlayable(e),
                                  )
                                }
                              >
                                <Text style={styles.trackPlayIcon}>{isThisTrack && player.isPlaying ? "⏸" : "▶"}</Text>
                                <Text style={styles.trackTitle} numberOfLines={1}>
                                  {t.title}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {ticketItems.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>TICKETS</Text>
              <View style={{ gap: 12 }}>
                {ticketItems.map((e) => {
                  const tier = e.product.ticketTier!;
                  return (
                    <View key={e.id} style={styles.ticketRow}>
                      {e.checkIn && (
                        <View style={styles.qrBox}>
                          <QRCode value={e.checkIn.code} size={56} backgroundColor={colors.ink} />
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {tier.event.title}
                        </Text>
                        <Text style={styles.cardSubtitle} numberOfLines={1}>
                          {tier.name} · {formatEventDate(tier.event.startsAt)}
                        </Text>
                        <Text style={styles.ticketStatus}>
                          {e.checkIn?.checkedInAt ? "Checked in" : "Show this QR code at the door"}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {merchItems.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>MERCH</Text>
              <View style={{ gap: 12 }}>
                {merchItems.map((e) => {
                  const status = e.order.merchFulfillment?.status ?? "TO_SHIP";
                  const img = merchImageUrl(e.product.merchItem);
                  return (
                    <View key={e.id} style={styles.merchRow}>
                      {img ? (
                        <Image source={{ uri: img }} style={styles.merchImage} />
                      ) : (
                        <View style={[styles.merchImage, styles.artPlaceholder]} />
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {e.product.title}
                        </Text>
                        <Text style={styles.cardSubtitle} numberOfLines={1}>
                          {e.product.creator.displayName}
                        </Text>
                      </View>
                      <Text style={styles.merchStatus}>{FULFILLMENT_LABEL[status]}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </>
      )}

      {actionsFor && (
        <ActionSheet
          visible
          title={actionsFor.product.title}
          onClose={() => setActionsFor(null)}
          actions={[
            { label: "Share", onPress: () => handleShare(actionsFor) },
            ...(buildPlayable(actionsFor).length > 1
              ? [{ label: "Shuffle", onPress: () => handleShuffle(actionsFor) }]
              : []),
            { label: actionsFor.pinnedAt ? "Unpin" : "Pin", onPress: () => handleTogglePin(actionsFor) },
            { label: "Play next", onPress: () => handlePlayNext(actionsFor) },
          ]}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: HORIZONTAL_PADDING, paddingTop: 60, paddingBottom: 100 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 12 },
  pageTitle: { color: colors.ink, fontSize: 24, fontFamily: fonts.serif, marginBottom: 16 },
  emptyText: { color: colors.ink3, fontSize: 13 },
  emptyTitle: { color: colors.ink, fontSize: 15 },
  errorText: { color: colors.redSoft, fontSize: 14 },
  signInButton: { backgroundColor: colors.red, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12 },
  signInButtonText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  section: { marginBottom: 28 },
  sectionLabel: { color: colors.ink3, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  artBox: { borderRadius: 8, backgroundColor: colors.surface2, overflow: "hidden", position: "relative", marginBottom: 6 },
  art: { width: "100%", height: "100%" },
  artPlaceholder: { backgroundColor: colors.surface2 },
  pinBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  pinBadgeText: { fontSize: 10 },
  playingBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  playingBadgeText: { color: colors.ink, fontSize: 11 },
  cardTitle: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  cardSubtitle: { color: colors.ink3, fontSize: 12, marginTop: 1 },
  trackList: { marginTop: 8, gap: 4 },
  trackRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  trackPlayIcon: { color: colors.ink, fontSize: 10, width: 14 },
  trackTitle: { color: colors.ink2, fontSize: 12, flex: 1 },
  ticketRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 10, padding: 12 },
  qrBox: { padding: 4, backgroundColor: colors.ink, borderRadius: 6 },
  ticketStatus: { color: colors.redSoft, fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginTop: 4 },
  merchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  merchImage: { width: 44, height: 44, borderRadius: 6 },
  merchStatus: { color: colors.redSoft, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
});
