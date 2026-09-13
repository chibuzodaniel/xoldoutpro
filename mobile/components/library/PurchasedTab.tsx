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
import QRCode from "react-native-qrcode-svg";
import { API_BASE_URL, apiGet, apiPatch } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { usePlayer } from "../../lib/PlayerContext";
import { downloadTrackForOffline, isDownloaded, removeDownload } from "../../lib/offline/downloads";
import type { LibraryEntitlement, LibraryTrack } from "../../lib/libraryTypes";
import { colors } from "../../lib/theme";
import { ActionSheet } from "../ActionSheet";
import { AddToCollectionSheet } from "../AddToCollectionSheet";
import { FULFILLMENT_LABEL, artworkUrl, beatCoverUrl, merchImageUrl, buildPlayable, formatEventDate } from "../../lib/libraryHelpers";

const HORIZONTAL_PADDING = 16;

export function PurchasedTab() {
  const { firebaseUser } = useAuth();
  const player = usePlayer();
  const { width } = useWindowDimensions();

  const [entitlements, setEntitlements] = useState<LibraryEntitlement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<LibraryEntitlement | null>(null);
  const [collectingFor, setCollectingFor] = useState<LibraryEntitlement | null>(null);
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [busyTrackId, setBusyTrackId] = useState<string | null>(null);

  async function refreshDownloadState(tracks: LibraryTrack[]) {
    const entries = await Promise.all(tracks.map(async (t) => [t.id, await isDownloaded(t.id)] as const));
    setDownloaded((cur) => ({ ...cur, ...Object.fromEntries(entries) }));
  }

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      setError(null);
      const idToken = await firebaseUser.getIdToken();
      const data = await apiGet<{ entitlements: LibraryEntitlement[] }>("/api/library", idToken);
      setEntitlements(data.entitlements);
      const allTracks = data.entitlements.flatMap((e) => e.product.release?.tracks ?? []);
      await refreshDownloadState(allTracks);
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

  async function handleDownload(e: LibraryEntitlement, track: LibraryTrack) {
    if (!firebaseUser) return;
    setBusyTrackId(track.id);
    try {
      const idToken = await firebaseUser.getIdToken();
      await downloadTrackForOffline(
        {
          trackId: track.id,
          productId: e.product.id,
          title: track.title,
          artistName: e.product.creator.displayName,
          artworkUrl: artworkUrl(e.product.release),
          durationSec: track.durationSec,
        },
        idToken,
      );
      setDownloaded((cur) => ({ ...cur, [track.id]: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusyTrackId(null);
    }
  }

  async function handleRemoveDownload(trackId: string) {
    await removeDownload(trackId);
    setDownloaded((cur) => ({ ...cur, [trackId]: false }));
  }

  async function handleDownloadAllForRelease(e: LibraryEntitlement) {
    const tracks = e.product.release?.tracks ?? [];
    for (const track of tracks) {
      if (!(await isDownloaded(track.id))) await handleDownload(e, track);
    }
  }

  async function handleRemoveAllForRelease(e: LibraryEntitlement) {
    const tracks = e.product.release?.tracks ?? [];
    for (const track of tracks) {
      if (downloaded[track.id]) await handleRemoveDownload(track.id);
    }
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
      {player.error && <Text style={styles.playerErrorText}>{player.error}</Text>}

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
                  const releaseTracks = e.product.release?.tracks ?? [];
                  const allDownloaded = releaseTracks.length > 0 && releaseTracks.every((t) => downloaded[t.id]);
                  const isDownloadBusy = releaseTracks.some((t) => t.id === busyTrackId);
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
                        {e.product.release && (
                          <TouchableOpacity
                            style={styles.downloadBadge}
                            onPress={() => (allDownloaded ? handleRemoveAllForRelease(e) : handleDownloadAllForRelease(e))}
                            disabled={isDownloadBusy}
                          >
                            {isDownloadBusy ? (
                              <ActivityIndicator size="small" color={colors.ink} />
                            ) : (
                              <Text style={styles.downloadBadgeText}>{allDownloaded ? "✓" : "⬇"}</Text>
                            )}
                          </TouchableOpacity>
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
                                disabled={busyTrackId === t.id}
                              >
                                <Text style={styles.trackPlayIcon}>{isThisTrack && player.isPlaying ? "⏸" : "▶"}</Text>
                                <Text style={styles.trackTitle} numberOfLines={1}>
                                  {t.title}
                                </Text>
                                {downloaded[t.id] && <Text style={styles.trackDownloadedIcon}>✓</Text>}
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

      {actionsFor &&
        (() => {
          const releaseTracks = actionsFor.product.release?.tracks ?? [];
          const allDownloaded = releaseTracks.length > 0 && releaseTracks.every((t) => downloaded[t.id]);
          return (
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
                { label: "Add to collection", onPress: () => setCollectingFor(actionsFor) },
                { label: "Play next", onPress: () => handlePlayNext(actionsFor) },
                ...(actionsFor.product.release
                  ? [
                      allDownloaded
                        ? { label: "Remove from offline", destructive: true, onPress: () => handleRemoveAllForRelease(actionsFor) }
                        : { label: "Download for offline", onPress: () => handleDownloadAllForRelease(actionsFor) },
                    ]
                  : []),
              ]}
            />
          );
        })()}

      {collectingFor && (
        <AddToCollectionSheet
          entitlementId={collectingFor.id}
          visible
          onClose={() => setCollectingFor(null)}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: HORIZONTAL_PADDING, paddingTop: 16, paddingBottom: 100 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 60 },
  emptyText: { color: colors.ink3, fontSize: 13 },
  errorText: { color: colors.redSoft, fontSize: 14 },
  playerErrorText: { color: colors.redSoft, fontSize: 12, marginBottom: 12 },
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
  downloadBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  downloadBadgeText: { color: colors.ink, fontSize: 11 },
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
  trackDownloadedIcon: { color: colors.redSoft, fontSize: 11, fontWeight: "700" },
  ticketRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 10, padding: 12 },
  qrBox: { padding: 4, backgroundColor: colors.ink, borderRadius: 6 },
  ticketStatus: { color: colors.redSoft, fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginTop: 4 },
  merchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  merchImage: { width: 44, height: 44, borderRadius: 6 },
  merchStatus: { color: colors.redSoft, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
});
