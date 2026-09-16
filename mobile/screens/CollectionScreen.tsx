import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, TouchableOpacity, View, useWindowDimensions, StyleSheet } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiDelete, apiGet } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { usePlayer } from "../lib/PlayerContext";
import type { RootStackParamList } from "../lib/navigation";
import type { LibraryEntitlement } from "../lib/libraryTypes";
import { colors } from "../lib/theme";
import { ActionSheet } from "../components/ActionSheet";
import { CollectionHero } from "../components/library/CollectionHero";
import { TicketQrCode } from "../components/TicketQrCode";
import { FULFILLMENT_LABEL, artworkUrl, beatCoverUrl, merchImageUrl, buildPlayable, formatEventDate } from "../lib/libraryHelpers";

const HORIZONTAL_PADDING = 16;

export function CollectionScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Collection">>();
  const { id, name } = route.params;
  const { firebaseUser } = useAuth();
  const player = usePlayer();
  const { width } = useWindowDimensions();

  const [items, setItems] = useState<LibraryEntitlement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<LibraryEntitlement | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      setError(null);
      const idToken = await firebaseUser.getIdToken();
      const data = await apiGet<{ collection: { id: string; name: string }; items: { entitlement: LibraryEntitlement; addedAt: string }[] }>(
        `/api/collections/${id}`,
        idToken,
      );
      setItems(data.items.map((i) => i.entitlement));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [firebaseUser, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRemove(e: LibraryEntitlement) {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    try {
      await apiDelete(`/api/collections/${id}/items/${e.id}`, idToken);
      await load();
    } catch {
      // best-effort
    }
  }

  function handlePlayTap(e: LibraryEntitlement) {
    if (player.current?.productId !== e.product.id) {
      const queue = buildPlayable(e);
      if (queue.length === 0) return;
      player.play(queue[0], queue);
    } else if (!player.isPlaying) {
      player.togglePlay();
    }
    navigation.navigate("Player");
  }

  function handlePlayAll(musicItems: LibraryEntitlement[], shuffle?: boolean) {
    const queue = musicItems.flatMap(buildPlayable);
    if (queue.length === 0) return;
    if (shuffle) {
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
    }
    player.play(queue[0], queue);
    navigation.navigate("Player");
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (items === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  const musicItems = items.filter((e) => e.product.release || e.product.beat);
  const ticketItems = items.filter((e) => e.product.ticketTier);
  const merchItems = items.filter((e) => e.product.merchItem);
  const cardWidth = (width - HORIZONTAL_PADDING * 2 - 16) / 2;
  const heroCover = musicItems.length > 0 ? (musicItems[0].product.release ? artworkUrl(musicItems[0].product.release) : beatCoverUrl(musicItems[0].product.beat)) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <CollectionHero
        title={name}
        subtitle={`${items.length} item${items.length === 1 ? "" : "s"}`}
        coverImage={heroCover ?? null}
        onPlay={() => handlePlayAll(musicItems)}
        onShuffle={musicItems.length > 1 ? () => handlePlayAll(musicItems, true) : undefined}
        playDisabled={musicItems.length === 0}
      />

      <View style={styles.body}>
      {items.length === 0 ? (
        <Text style={styles.emptyText}>Nothing in this collection yet — add items from Purchased.</Text>
      ) : (
        <>
          {musicItems.length > 0 && (
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
                      {isThisPlaying && (
                        <View style={styles.playingBadge}>
                          <Text style={styles.playingBadgeText}>♫</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {e.product.title}
                    </Text>
                    <Text style={styles.cardSubtitle} numberOfLines={1}>
                      {e.product.creator.displayName}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {ticketItems.length > 0 && (
            <View style={{ gap: 12, marginTop: 20 }}>
              {ticketItems.map((e) => {
                const tier = e.product.ticketTier!;
                return (
                  <TouchableOpacity key={e.id} style={styles.ticketRow} onLongPress={() => setActionsFor(e)}>
                    {e.checkIn && <TicketQrCode value={e.checkIn.code} label={`${tier.event.title} · ${tier.name}`} />}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {tier.event.title}
                      </Text>
                      <Text style={styles.cardSubtitle} numberOfLines={1}>
                        {tier.name} · {formatEventDate(tier.event.startsAt)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {merchItems.length > 0 && (
            <View style={{ gap: 12, marginTop: 20 }}>
              {merchItems.map((e) => {
                const status = e.order.merchFulfillment?.status ?? "TO_SHIP";
                const img = merchImageUrl(e.product.merchItem);
                return (
                  <TouchableOpacity key={e.id} style={styles.merchRow} onLongPress={() => setActionsFor(e)}>
                    {img ? <Image source={{ uri: img }} style={styles.merchImage} /> : <View style={[styles.merchImage, styles.artPlaceholder]} />}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {e.product.title}
                      </Text>
                      <Text style={styles.cardSubtitle} numberOfLines={1}>
                        {e.product.creator.displayName}
                      </Text>
                    </View>
                    <Text style={styles.merchStatus}>{FULFILLMENT_LABEL[status]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
      )}
      </View>

      {actionsFor && (
        <ActionSheet
          visible
          title={actionsFor.product.title}
          onClose={() => setActionsFor(null)}
          actions={[{ label: "Remove from collection", destructive: true, onPress: () => handleRemove(actionsFor) }]}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 60 },
  body: { paddingHorizontal: HORIZONTAL_PADDING, paddingTop: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  errorText: { color: colors.redSoft, fontSize: 14 },
  emptyText: { color: colors.ink3, fontSize: 13, lineHeight: 19 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  artBox: { borderRadius: 8, backgroundColor: colors.surface2, overflow: "hidden", position: "relative", marginBottom: 6 },
  art: { width: "100%", height: "100%" },
  artPlaceholder: { backgroundColor: colors.surface2 },
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
  ticketRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 10, padding: 12 },
  merchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  merchImage: { width: 44, height: 44, borderRadius: 6 },
  merchStatus: { color: colors.redSoft, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
});
