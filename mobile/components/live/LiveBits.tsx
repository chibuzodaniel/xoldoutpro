import { useEffect, useRef, useState } from "react";
import { MentionText } from "./mentions";
import { playGiftSound } from "../../lib/giftSound";
import { ActivityIndicator, Animated, Dimensions, Easing, Image, Linking, Modal, ScrollView, Share, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { API_BASE_URL, apiGet } from "../../lib/api";
import { giftByType, type GiftMoment, type LiveFeedItem, type LiveSessionSummary, type XgPack } from "../../lib/liveTypes";
import { colors, fonts } from "../../lib/theme";
import { EyeIcon, GiftArt, ShieldIcon, XgCoin } from "./LiveIcons";

// The shared Xoldout Live building blocks — React Native port of web's
// components/live/{LiveCard,LiveFeed,AddBalance,BottomSheet}.tsx, kept
// visually identical to the mockups on both platforms.

// ─── Initials avatar ─────────────────────────────────────────────────────

const INITIALS_COLORS = ["#4f7a3a", "#7a3a5c", "#3a5c7a", "#7a5c3a", "#5c3a7a", "#3a7a6b", "#7a3a3a", "#6b6b3a"];

// The mockup's convention: the first two letters of the name, not first +
// last initial ("Amara Voss" → AM, "chi_chi" → CH, "DJ Kelechi" → DJ).
export function initialsOf(name: string): string {
  // Strips spaces/punctuation only (not \p{L}, which Hermes may not support).
  const letters = name.replace(/[\s.,_\-'"!?@#()]/g, "");
  return (letters || "?").slice(0, 2).toUpperCase();
}

function initialsColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return INITIALS_COLORS[Math.abs(hash) % INITIALS_COLORS.length];
}

export function InitialsAvatar({ name, size = 28, avatarUrl }: { name: string; size?: number; avatarUrl?: string | null }) {
  const frame = { width: size, height: size, borderRadius: size / 2 };
  if (avatarUrl) return <Image source={{ uri: avatarUrl }} style={[frame, styles.avatarBorder]} />;
  return (
    <View style={[frame, styles.avatarBorder, styles.initials, { backgroundColor: initialsColorFor(name) }]}>
      <Text style={[styles.initialsText, { fontSize: Math.round(size * 0.36) }]}>{initialsOf(name)}</Text>
    </View>
  );
}

// ─── "Live now" card ─────────────────────────────────────────────────────

const LIVE_CARD_GRADIENTS: [string, string, string][] = [
  ["#5b1f8f", "#3a1460", "#140a1f"],
  ["#8f3a1f", "#5c2312", "#1f0d08"],
  ["#1f6b6b", "#124545", "#081a1a"],
  ["#7d1430", "#4d0c1e", "#1f050c"],
];

export function LiveCard({ session, index, onPress }: { session: LiveSessionSummary; index: number; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient colors={LIVE_CARD_GRADIENTS[index % LIVE_CARD_GRADIENTS.length]} style={StyleSheet.absoluteFill} />
      <View style={styles.cardLiveBadge}>
        <View style={styles.liveDot} />
        <Text style={styles.cardLiveText}>LIVE</Text>
      </View>
      {session.isBattle && (
        <View style={styles.cardBattleBadge}>
          <Text style={styles.cardBattleText}>⚔️ BATTLE</Text>
        </View>
      )}
      <View style={styles.cardViewers}>
        <EyeIcon size={13} />
        <Text style={styles.cardViewersText}>{(session.viewerCount ?? 0).toLocaleString("en-NG")}</Text>
      </View>
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.75)"]} style={styles.cardFooter}>
        <View style={styles.cardCreatorRow}>
          <InitialsAvatar name={session.creator.displayName} avatarUrl={session.creator.avatarUrl} size={32} />
          <Text style={styles.cardCreator} numberOfLines={1}>
            {session.creator.displayName}
          </Text>
        </View>
        {session.isPaidAccess && <Text style={styles.cardPrice}>{session.priceXg} XG to join</Text>}
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── Chat / gift feed ────────────────────────────────────────────────────

function comboSuffix(count: number) {
  return count > 1 ? ` ×${count}` : "";
}

export function LiveFeed({ items, selfId }: { items: LiveFeedItem[]; selfId: string | null }) {
  const scrollRef = useRef<ScrollView | null>(null);
  return (
    <ScrollView
      ref={scrollRef}
      style={styles.feed}
      contentContainerStyle={styles.feedContent}
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      showsVerticalScrollIndicator={false}
    >
      {items.slice(-40).map((item) => {
        if (item.kind === "system") {
          return (
            <Text key={item.id} style={styles.systemText}>
              {item.text}
            </Text>
          );
        }
        if (item.kind === "gift") {
          const name = item.senderId === selfId ? "You" : item.senderName;
          return (
            <View key={item.id} style={styles.giftRow}>
              <InitialsAvatar name={item.senderName} size={28} />
              <Text style={styles.feedText} numberOfLines={1}>
                <Text style={styles.feedSender}>{name}</Text> sent {item.label}
                {comboSuffix(item.count)} {giftByType(item.giftType)?.emoji}
              </Text>
            </View>
          );
        }
        if (item.kind === "request") {
          return (
            <View key={item.id} style={[styles.giftRow, styles.requestRow]}>
              <InitialsAvatar name={item.senderName} size={28} />
              <Text style={styles.feedText} numberOfLines={2}>
                <Text style={styles.feedSender}>{item.senderName}</Text> requested: {item.message} · {item.xgAmount} XG
              </Text>
            </View>
          );
        }
        return (
          <View key={item.id} style={[styles.chatRow, item.mentionsMe && styles.chatRowMentioned]}>
            <InitialsAvatar name={item.senderName} size={28} />
            <Text style={[styles.feedText, styles.chatText]}>
              <Text style={styles.feedSender}>{item.senderName}</Text>
              {item.fromHost ? <Text style={styles.hostTag}> HOST</Text> : null} <MentionText text={item.text} mentions={item.mentions} />
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── Top banner + big celebration ────────────────────────────────────────

// The red "X sent Y" pill under the header — slides in, holds, fades. Keyed
// by moment.key from the caller so every send replays it.
export function GiftBanner({ moment, isSelf }: { moment: GiftMoment; isSelf: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-24)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 0, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.delay(2400),
      Animated.timing(opacity, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [opacity, translateX]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateX }], alignSelf: "flex-start", maxWidth: "85%" }}>
      <LinearGradient colors={[colors.red, "#8f1220"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.banner}>
        <GiftArt type={moment.giftType} size={24} />
        <Text style={styles.bannerText} numberOfLines={1}>
          <Text style={styles.bannerName}>{isSelf ? "You" : moment.senderName}</Text> sent {moment.label}
          {comboSuffix(moment.count)}
        </Text>
      </LinearGradient>
    </Animated.View>
  );
}

const SCREEN = Dimensions.get("window");
const BILLS = Array.from({ length: 14 }, (_, i) => ({
  left: ((i * 37) % 92) / 100,
  delay: (i % 7) * 180,
  duration: 1900 + (i % 4) * 350,
  rotate: `${((i * 53) % 70) - 35}deg`,
}));

function FallingBill({ left, delay, duration, rotate }: (typeof BILLS)[number]) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(progress, { toValue: 1, duration, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [progress, delay, duration]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-64, SCREEN.height + 40] });
  const translateX = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 18, -12] });
  const opacity = progress.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] });

  return (
    <Animated.View style={{ position: "absolute", top: 0, left: left * SCREEN.width, opacity, transform: [{ translateY }, { translateX }, { rotate }] }}>
      <GiftArt type="MONEY_SPRAY" size={48} />
    </Animated.View>
  );
}

// The big centered moment. Money Spray rains bills across the whole stage;
// every other gift pops its art large in the middle with a serif
// "Grammy ×4" caption. Keyed by moment.key from the caller.
export function GiftCelebration({ moment }: { moment: GiftMoment }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.4)).current;

  // Celebration sound — once per gift (this component is keyed per gift).
  useEffect(() => {
    playGiftSound(moment.giftType);
  }, [moment.giftType]);

  useEffect(() => {
    if (moment.giftType === "MONEY_SPRAY") return;
    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
      ]),
      Animated.delay(1900),
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [moment.giftType, opacity, scale]);

  if (moment.giftType === "MONEY_SPRAY") {
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
        {BILLS.map((b, i) => (
          <FallingBill key={i} {...b} />
        ))}
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.celebrationCenter]}>
      <Animated.View style={{ alignItems: "center", opacity, transform: [{ scale }] }}>
        <GiftArt type={moment.giftType} size={176} />
        <Text style={styles.celebrationText}>
          {moment.label}
          {comboSuffix(moment.count)}
        </Text>
      </Animated.View>
    </View>
  );
}

// ─── Bottom sheet + Add balance ──────────────────────────────────────────

// Dark rounded sheet with the mockup's grab handle.
export function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <View style={styles.sheetHandle} />
          {children}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// The mockup's "Add balance" block. Tapping a pack still completes the
// purchase on xoldout.app rather than in-app — see LiveCoinsScreen.tsx's
// comment on why (app-store in-app-purchase rules).
export function AddBalance() {
  const [packs, setPacks] = useState<XgPack[] | null>(null);

  useEffect(() => {
    apiGet<{ packs: XgPack[] }>("/api/coins/topup")
      .then((data) => setPacks(data.packs))
      .catch(() => setPacks([]));
  }, []);

  return (
    <View>
      <Text style={styles.addTitle}>Add balance</Text>
      <Text style={styles.addSubtitle}>XG are Xoldout Gifts you send to artists during lives.</Text>

      {packs === null ? (
        <ActivityIndicator color={colors.ink} style={{ marginVertical: 24 }} />
      ) : (
        <View style={styles.packList}>
          {packs.map((pack, i) => (
            <TouchableOpacity key={i} style={styles.packRow} onPress={() => Linking.openURL(`${API_BASE_URL}/live/coins`)}>
              <XgCoin size={36} />
              <View style={{ flex: 1 }}>
                <Text style={styles.packAmount}>{pack.xgAmount.toLocaleString("en-NG")} XG</Text>
                {!!pack.bonusPercent && <Text style={styles.packBonus}>+{pack.bonusPercent}% bonus</Text>}
              </View>
              <Text style={styles.packPrice}>{formatNaira(pack.priceKobo)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.noteRow}>
        <ShieldIcon size={14} />
        <Text style={styles.noteText}>Balance is only credited after your payment is confirmed.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarBorder: { borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  initials: { alignItems: "center", justifyContent: "center" },
  initialsText: { color: "#fff", fontWeight: "700" },

  card: { flex: 1, aspectRatio: 3 / 4, borderRadius: 16, overflow: "hidden", backgroundColor: colors.surface2 },
  cardBattleBadge: { position: "absolute", left: 10, top: 34, backgroundColor: colors.amber, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  cardBattleText: { color: "#000", fontSize: 11, fontWeight: "800" },
  cardLiveBadge: {
    position: "absolute",
    left: 10,
    top: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.red,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  cardLiveText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  cardViewers: {
    position: "absolute",
    right: 10,
    top: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cardViewersText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  cardFooter: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, paddingTop: 40 },
  cardCreatorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardCreator: { color: "#fff", fontSize: 15, fontWeight: "700", flexShrink: 1 },
  cardPrice: { color: colors.amber, fontSize: 11, fontWeight: "700", marginTop: 6 },

  feed: { maxHeight: SCREEN.height * 0.36, flexGrow: 0 },
  feedContent: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  systemText: { color: "rgba(255,255,255,0.8)", fontSize: 13, paddingHorizontal: 4 },
  chatRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  chatRowMentioned: {
    borderWidth: 1,
    borderColor: "rgba(217,154,43,0.5)",
    backgroundColor: "rgba(217,154,43,0.15)",
    borderRadius: 16,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 12,
  },
  hostTag: { color: "#ff5566", fontSize: 11, fontWeight: "800" },
  chatText: { flex: 1 },
  giftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    maxWidth: "100%",
    backgroundColor: "rgba(225,29,46,0.35)",
    borderWidth: 1,
    borderColor: "rgba(225,29,46,0.6)",
    borderRadius: 999,
    paddingVertical: 2,
    paddingLeft: 2,
    paddingRight: 12,
  },
  requestRow: { backgroundColor: "rgba(217,154,43,0.2)", borderColor: "rgba(217,154,43,0.5)" },
  feedText: { color: "rgba(255,255,255,0.9)", fontSize: 15, flexShrink: 1 },
  feedSender: { color: "#fff", fontWeight: "700" },

  banner: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 999, paddingVertical: 7, paddingLeft: 10, paddingRight: 20 },
  bannerText: { color: "#fff", fontSize: 15, flexShrink: 1 },
  bannerName: { fontWeight: "800" },

  celebrationCenter: { alignItems: "center", justifyContent: "center" },
  celebrationText: { color: "#f3d9a0", fontSize: 30, fontFamily: fonts.serif, marginTop: 4 },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#121214",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
  },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", marginBottom: 20 },

  addTitle: { color: colors.ink, fontSize: 28, fontFamily: fonts.serif, marginBottom: 6 },
  addSubtitle: { color: colors.ink2, fontSize: 14, marginBottom: 18 },
  packList: { gap: 6, marginBottom: 18 },
  packRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 6 },
  packAmount: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  packBonus: { color: colors.redSoft, fontSize: 13, marginTop: 1 },
  packPrice: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  noteText: { color: colors.ink3, fontSize: 13, flex: 1 },
});

// ─── Share + viewer list ─────────────────────────────────────────────────

/** Opens the phone's share sheet with the Live's web link (works for anyone, app or not). */
export async function shareLive(liveSessionId: string, message: string) {
  const url = `${API_BASE_URL}/live/${liveSessionId}`;
  try {
    await Share.share({ message: `${message}\n${url}`, url });
  } catch {
    // dismissed / unavailable — nothing to do
  }
}

export function ShareLiveButton({ liveSessionId, message, label = "Share" }: { liveSessionId: string; message: string; label?: string }) {
  return (
    <TouchableOpacity style={extraStyles.shareButton} onPress={() => shareLive(liveSessionId, message)} accessibilityLabel="Share this Live">
      <Text style={extraStyles.shareButtonText}>↗ {label}</Text>
    </TouchableOpacity>
  );
}

/** The host's "Watching now" sheet — everyone currently in the room. */
export function ViewersSheet({ visible, onClose, viewers }: { visible: boolean; onClose: () => void; viewers: { id: string; name: string }[] }) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={extraStyles.viewersHeader}>
        <Text style={extraStyles.viewersTitle}>Watching now</Text>
        <Text style={extraStyles.viewersCount}>{viewers.length.toLocaleString("en-NG")}</Text>
      </View>
      {viewers.length === 0 ? (
        <Text style={extraStyles.viewersEmpty}>No one has joined yet. Share your link to bring people in.</Text>
      ) : (
        <ScrollView style={{ maxHeight: SCREEN.height * 0.55 }}>
          {viewers.map((v) => (
            <View key={v.id} style={extraStyles.viewerRow}>
              <InitialsAvatar name={v.name} size={36} />
              <Text style={extraStyles.viewerName} numberOfLines={1}>
                {v.name}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const extraStyles = StyleSheet.create({
  shareButton: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  shareButtonText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  viewersHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 },
  viewersTitle: { color: colors.ink, fontSize: 24, fontFamily: fonts.serif },
  viewersCount: { color: colors.ink3, fontSize: 14 },
  viewersEmpty: { color: colors.ink3, fontSize: 14, textAlign: "center", paddingVertical: 24 },
  viewerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  viewerName: { color: colors.ink, fontSize: 15, flex: 1 },
});
