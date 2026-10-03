import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { LiveKitRoom, VideoTrack, useTracks, useDataChannel, useLocalParticipant, useRemoteParticipants } from "@livekit/react-native";
import { Track } from "livekit-client";
import { useAuth } from "../lib/AuthContext";
import { apiDelete, apiGet, apiPost } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";
import type { GiftEvent, GiftMoment, LiveJoinResponse, LiveFeedItem } from "../lib/liveTypes";
import { appendGift, GIFT_CATALOG, type GiftType } from "../lib/liveTypes";
import { colors, fonts } from "../lib/theme";
import { useLiveAudioSession } from "../lib/liveAudio";
import { AddBalance, BottomSheet, GiftBanner, GiftCelebration, InitialsAvatar, LiveFeed, ShareLiveButton } from "../components/live/LiveBits";
import { CloseIcon, EyeIcon, GiftArt, XgCoin } from "../components/live/LiveIcons";

const MIN_REQUEST_XG = 10;
// How long the top banner + big celebration stay up after the latest gift.
const GIFT_MOMENT_MS = 3200;

function formatNaira(kobo: number) {
  if (kobo === 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// apiGet/apiPost throw a generic "<path> -> <status>" Error (see lib/api.ts);
// 402 from the gift/request/access routes always means "not enough XG".
type ScheduledInfo = {
  id: string;
  title: string;
  status: "SCHEDULED" | "LIVE" | "ENDED";
  scheduledFor: string | null;
  reminderCount: number;
  remindedByMe: boolean;
  isHost?: boolean;
  creator: { handle: string; displayName: string };
};

function countdown(ms: number): string {
  if (ms <= 0) return "Starting any moment";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h}h ${m}m ${(s % 60).toString().padStart(2, "0")}s`;
}

function isInsufficientXg(e: unknown) {
  return e instanceof Error && e.message.includes("-> 402");
}

// Mobile's Live viewer — same video-layer plumbing as LiveBroadcastScreen,
// subscribe-only (no video/audio props on LiveKitRoom). Chat/gifts ride the
// room's own data channel with the exact same topics/JSON shape web's
// app/(app)/live/[id]/page.tsx uses, so a web viewer and a mobile viewer of
// the same Live see each other's messages.
export function LiveViewerScreen() {
  useLiveAudioSession("viewer");
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "LiveViewer">>();
  const { firebaseUser } = useAuth();
  const [join, setJoin] = useState<LiveJoinResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "needs-payment" | "ended" | "ready" | "scheduled">("loading");
  // A scheduled Live (opened from a shared link or the Upcoming rail) — shown
  // as a countdown with Remind me / Share until the host starts it.
  const [scheduled, setScheduled] = useState<ScheduledInfo | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [priceXg, setPriceXg] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [addBalanceOpen, setAddBalanceOpen] = useState(false);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const attemptJoin = useCallback(async () => {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    try {
      const data = await apiGet<LiveJoinResponse>(`/api/live/${route.params.id}/join`, idToken);
      setJoin(data);
      setStatus("ready");
    } catch (e) {
      // A 402 here always means paid access is required (the only reason
      // the join route returns it), so the status code alone is enough.
      if (isInsufficientXg(e)) {
        setPriceXg(null);
        setStatus("needs-payment");
        return;
      }
      // Not joinable — find out whether it's scheduled (not started yet) or really over.
      try {
        const info = await apiGet<{ live: ScheduledInfo }>(`/api/live/${route.params.id}`, idToken);
        if (info.live.status === "SCHEDULED") {
          setScheduled(info.live);
          setStatus("scheduled");
          return;
        }
      } catch {
        // fall through to ended
      }
      setStatus("ended");
    }
  }, [firebaseUser, route.params.id]);

  useEffect(() => {
    attemptJoin();
  }, [attemptJoin]);

  // While scheduled: tick the countdown, and re-try joining every 15s so the
  // screen drops into the Live by itself the moment the host starts.
  useEffect(() => {
    if (status !== "scheduled") return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => attemptJoin(), 15000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [status, attemptJoin]);

  async function startScheduled() {
    if (!firebaseUser || !scheduled) return;
    setBusy(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPost(`/api/live/${scheduled.id}/start`, idToken);
      navigation.replace("LiveBroadcast", { id: scheduled.id });
    } catch (e) {
      Alert.alert("Could not start the Live", e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  function cancelScheduled() {
    if (!firebaseUser || !scheduled) return;
    Alert.alert("Cancel this Live?", "Its link will show it as cancelled.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel Live",
        style: "destructive",
        onPress: async () => {
          try {
            const idToken = await firebaseUser.getIdToken();
            await apiPost(`/api/live/${scheduled.id}/end`, idToken);
          } catch {
            // already ended — fine either way
          }
          navigation.navigate("LiveNow");
        },
      },
    ]);
  }

  async function toggleReminder() {
    if (!firebaseUser || !scheduled) return;
    setBusy(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const res = scheduled.remindedByMe
        ? await apiDelete<{ remindedByMe: boolean; reminderCount: number }>(`/api/live/${scheduled.id}/remind`, idToken)
        : await apiPost<{ remindedByMe: boolean; reminderCount: number }>(`/api/live/${scheduled.id}/remind`, idToken);
      setScheduled({ ...scheduled, remindedByMe: res.remindedByMe, reminderCount: res.reminderCount });
    } catch (e) {
      Alert.alert("Could not update your reminder", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleBuyAccess() {
    if (!firebaseUser) return;
    setBusy(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPost(`/api/live/${route.params.id}/access`, idToken);
      setStatus("loading");
      await attemptJoin();
    } catch (e) {
      if (isInsufficientXg(e)) setAddBalanceOpen(true);
      else Alert.alert("Could not join", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (status === "needs-payment") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>This Live is paid</Text>
        {priceXg !== null && <Text style={styles.subtitle}>Join for {priceXg} XG.</Text>}
        <TouchableOpacity style={styles.primaryButton} onPress={handleBuyAccess} disabled={busy}>
          <Text style={styles.primaryButtonText}>{busy ? "Joining…" : "Join"}</Text>
        </TouchableOpacity>
        <BottomSheet visible={addBalanceOpen} onClose={() => setAddBalanceOpen(false)}>
          <AddBalance />
        </BottomSheet>
      </View>
    );
  }

  if (status === "scheduled" && scheduled) {
    const startsAt = scheduled.scheduledFor ? new Date(scheduled.scheduledFor) : null;
    return (
      <View style={styles.centered}>
        <Text style={styles.subtitle}>@{scheduled.creator.handle} is going live</Text>
        <Text style={styles.title}>{scheduled.title}</Text>
        <Text style={styles.countdownLabel}>STARTS IN</Text>
        <Text style={styles.countdown}>{startsAt ? countdown(startsAt.getTime() - now) : "—"}</Text>
        {startsAt && (
          <Text style={styles.subtitle}>
            {startsAt.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          </Text>
        )}
        <Text style={styles.subtitle}>
          {scheduled.reminderCount === 1 ? "1 person will be notified" : `${scheduled.reminderCount} people will be notified`}
        </Text>
        {scheduled.isHost ? (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={startScheduled} disabled={busy}>
              <Text style={styles.primaryButtonText}>{busy ? "Starting…" : "Start Live now"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={cancelScheduled} disabled={busy}>
              <Text style={styles.subtitle}>Cancel this Live</Text>
            </TouchableOpacity>
          </>
        ) : (
        <TouchableOpacity style={[styles.primaryButton, scheduled.remindedByMe && styles.secondaryButton]} onPress={toggleReminder} disabled={busy}>
          <Text style={styles.primaryButtonText}>{scheduled.remindedByMe ? "✓ You'll be reminded" : "🔔 Remind me"}</Text>
        </TouchableOpacity>
        )}
        <ShareLiveButton liveSessionId={scheduled.id} message={`${scheduled.creator.displayName} is going live on XOLDOUT: ${scheduled.title}`} />
      </View>
    );
  }

  if (status === "ended" || !join) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>This Live has ended</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate("LiveNow")}>
          <Text style={styles.primaryButtonText}>Back to Live</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <LiveKitRoom serverUrl={join.url} token={join.token} video={false} audio={false} connect>
      <ViewerRoomContent liveSessionId={route.params.id} session={join.session} onClose={() => navigation.navigate("LiveNow")} />
    </LiveKitRoom>
  );
}

function ViewerRoomContent({
  liveSessionId,
  session,
  onClose,
}: {
  liveSessionId: string;
  session?: LiveJoinResponse["session"];
  onClose: () => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { localParticipant } = useLocalParticipant();
  // LiveKit identity is the viewer's own user id (web's lib/live/liveKit.ts
  // token minting), which is what gift events' senderId is compared against.
  const selfId = localParticipant.identity;
  const remoteParticipants = useRemoteParticipants();
  const tracks = useTracks([Track.Source.Camera]);
  const hostTrack = tracks.find((t) => t.participant.identity !== localParticipant.identity);
  const [feed, setFeed] = useState<LiveFeedItem[]>([]);
  const [chatText, setChatText] = useState("");
  const [giftSheetOpen, setGiftSheetOpen] = useState(false);
  const [addBalanceOpen, setAddBalanceOpen] = useState(false);
  const [balanceXg, setBalanceXg] = useState<number | null>(null);
  const [lastSentType, setLastSentType] = useState<GiftType | null>(null);
  const [giftMoment, setGiftMoment] = useState<GiftMoment | null>(null);
  const [requestSheetOpen, setRequestSheetOpen] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestXg, setRequestXg] = useState(MIN_REQUEST_XG);
  const [requestBusy, setRequestBusy] = useState(false);
  const { firebaseUser } = useAuth();

  const creatorName = session?.creator.displayName ?? "";

  async function loadBalance() {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    const data = await apiGet<{ balanceXg: number }>("/api/coins", idToken);
    setBalanceXg(data.balanceXg);
  }

  function openGiftSheet() {
    setGiftSheetOpen(true);
    loadBalance();
  }

  useEffect(() => {
    if (!giftMoment) return;
    const key = giftMoment.key;
    const id = setTimeout(() => setGiftMoment((current) => (current?.key === key ? null : current)), GIFT_MOMENT_MS);
    return () => clearTimeout(id);
  }, [giftMoment]);

  // Stable callback refs — see LiveBroadcastScreen.tsx's identical comment:
  // useDataChannel resubscribes whenever `onMessage` changes identity, so
  // these are memoized with an empty dep array (safe — only the functional
  // setState form is used, never a stale `feed` closure).
  const onChatMessage = useCallback((msg: { payload: Uint8Array }) => {
    const text = new TextDecoder().decode(msg.payload);
    try {
      const data = JSON.parse(text);
      setFeed((f) => [...f, { kind: "chat", id: `${Date.now()}-${Math.random()}`, senderName: data.senderName, text: data.text }]);
    } catch {
      // ignore malformed data messages
    }
  }, []);
  const onLiveEvent = useCallback((msg: { payload: Uint8Array }) => {
    const text = new TextDecoder().decode(msg.payload);
    try {
      const data = JSON.parse(text);
      if (data.kind === "gift") {
        const event = data as GiftEvent;
        setFeed((f) => {
          const { feed: next, count } = appendGift(f, event);
          setGiftMoment({ key: event.giftId, giftType: event.giftType, label: event.label, senderName: event.senderName, senderId: event.senderId, count });
          return next;
        });
      } else if (data.kind === "request") {
        setFeed((f) => [...f, { kind: "request", id: data.requestId, senderName: data.senderName, message: data.message, xgAmount: data.xgAmount }]);
      }
    } catch {
      // ignore malformed data messages
    }
  }, []);
  const { send: sendChatData } = useDataChannel("chat", onChatMessage);
  useDataChannel("live-event", onLiveEvent);

  function sendChat() {
    const text = chatText.trim();
    if (!text) return;
    const senderName = firebaseUser?.displayName ?? "You";
    const payload = new TextEncoder().encode(JSON.stringify({ senderName, text }));
    sendChatData(payload, { topic: "chat", reliable: true });
    setFeed((f) => [...f, { kind: "chat", id: `${Date.now()}-${Math.random()}`, senderName: "You", text }]);
    setChatText("");
  }

  // Tapping a gift sends it straight away and keeps the sheet open, so
  // repeated taps stack into the mockup's "×N" combo.
  async function sendGift(giftType: GiftType) {
    if (!firebaseUser) return;
    setLastSentType(giftType);
    const xgAmount = GIFT_CATALOG.find((g) => g.type === giftType)?.xgAmount ?? 0;
    setBalanceXg((b) => (b === null ? b : b - xgAmount));
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPost(`/api/live/${liveSessionId}/gifts`, idToken, { giftType });
    } catch (e) {
      setBalanceXg((b) => (b === null ? b : b + xgAmount));
      if (isInsufficientXg(e)) setAddBalanceOpen(true);
      else Alert.alert("Could not send gift", e instanceof Error ? e.message : "Something went wrong");
    }
  }

  async function sendRequest() {
    const message = requestMessage.trim();
    if (!message || !firebaseUser) return;
    setRequestBusy(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPost(`/api/live/${liveSessionId}/requests`, idToken, { message, xgAmount: requestXg });
      setRequestSheetOpen(false);
      setRequestMessage("");
      setRequestXg(MIN_REQUEST_XG);
    } catch (e) {
      if (isInsufficientXg(e)) setAddBalanceOpen(true);
      else Alert.alert("Could not send request", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setRequestBusy(false);
    }
  }

  const addBalanceSheet = (
    <BottomSheet visible={addBalanceOpen} onClose={() => setAddBalanceOpen(false)}>
      <AddBalance />
    </BottomSheet>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#3a1460", "#2a0f45", "#0d0614"]} style={StyleSheet.absoluteFill} />
      {hostTrack ? (
        <VideoTrack trackRef={hostTrack} style={StyleSheet.absoluteFill} objectFit="cover" />
      ) : (
        // No video track yet: the creator's avatar large with a waveform.
        <View style={[StyleSheet.absoluteFill, styles.noVideo]}>
          <InitialsAvatar name={creatorName || "?"} avatarUrl={session?.creator.avatarUrl} size={144} />
          <View style={styles.waveform}>
            {[0.9, 0.5, 0.75, 0.35, 0.6, 0.4, 0.8].map((h, i) => (
              <View key={i} style={[styles.waveBar, { height: 40 * h }]} />
            ))}
          </View>
        </View>
      )}

      <LinearGradient colors={["rgba(0,0,0,0.55)", "transparent"]} style={styles.topScrim} pointerEvents="none" />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.85)"]} style={styles.bottomScrim} pointerEvents="none" />

      {giftMoment && <GiftCelebration key={giftMoment.key} moment={giftMoment} />}

      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <View style={styles.hostPill}>
            <InitialsAvatar name={creatorName || "?"} avatarUrl={session?.creator.avatarUrl} size={44} />
            <View style={{ flexShrink: 1 }}>
              <View style={styles.hostNameRow}>
                <Text style={styles.hostName} numberOfLines={1}>
                  {creatorName}
                </Text>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
              </View>
              {!!session?.title && (
                <Text style={styles.sessionTitle} numberOfLines={1}>
                  {session.title}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.viewerCount}>
            <EyeIcon size={18} />
            <Text style={styles.viewerCountText}>{(remoteParticipants.length + 1).toLocaleString("en-NG")}</Text>
          </View>
          <ShareLiveButton liveSessionId={liveSessionId} message={`${creatorName} is live on XOLDOUT — join now`} />
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Leave Live">
            <CloseIcon size={24} />
          </TouchableOpacity>
        </View>
        {giftMoment && (
          <View style={{ marginTop: 16 }}>
            <GiftBanner key={giftMoment.key} moment={giftMoment} isSelf={giftMoment.senderId === selfId} />
          </View>
        )}
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {session?.pinnedProduct && (
          <TouchableOpacity style={styles.pinnedBanner} onPress={() => navigation.navigate("Product", { id: session.pinnedProduct!.id })}>
            <Text style={styles.pinnedBannerText} numberOfLines={1}>
              🛍 {session.pinnedProduct.title}
            </Text>
            <Text style={styles.pinnedBannerPrice}>{formatNaira(session.pinnedProduct.priceKobo)}</Text>
          </TouchableOpacity>
        )}

        <LiveFeed items={feed} selfId={selfId} />

        <View style={styles.inputRow}>
          <TextInput
            value={chatText}
            onChangeText={setChatText}
            onSubmitEditing={sendChat}
            placeholder="Say something…"
            placeholderTextColor="rgba(255,255,255,0.5)"
            style={styles.chatInput}
          />
          <TouchableOpacity style={styles.giftButton} onPress={openGiftSheet}>
            <GiftArt type="GRAMMY" size={24} />
            <Text style={styles.giftButtonText}>Gift</Text>
          </TouchableOpacity>
        </View>
      </View>

      <BottomSheet visible={giftSheetOpen} onClose={() => setGiftSheetOpen(false)}>
        <View style={styles.sheetHeaderRow}>
          <Text style={styles.sheetTitle}>Send a gift</Text>
          <TouchableOpacity style={styles.balanceButton} onPress={() => setAddBalanceOpen(true)}>
            <XgCoin size={20} />
            <Text style={styles.balanceText}>{balanceXg === null ? "…" : balanceXg.toLocaleString("en-NG")} XG</Text>
            <Text style={styles.balancePlus}>+</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.giftGrid}>
          {GIFT_CATALOG.map((g) => (
            <TouchableOpacity
              key={g.type}
              style={[styles.giftOption, lastSentType === g.type && styles.giftOptionSelected]}
              onPress={() => sendGift(g.type)}
            >
              <GiftArt type={g.type} size={44} />
              <Text style={styles.giftOptionLabel} numberOfLines={1}>
                {g.label}
              </Text>
              <Text style={styles.giftOptionAmount}>{g.xgAmount} XG</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          onPress={() => {
            setGiftSheetOpen(false);
            setRequestSheetOpen(true);
          }}
        >
          <Text style={styles.requestLink}>Send a paid request instead ›</Text>
        </TouchableOpacity>
        {/* Nested so it stacks over the gift sheet, as in the mockup. */}
        {addBalanceSheet}
      </BottomSheet>

      <BottomSheet visible={requestSheetOpen} onClose={() => setRequestSheetOpen(false)}>
        <Text style={styles.requestTitle}>Send a request</Text>
        <Text style={styles.sheetSubtitle}>Paid, to get the creator&apos;s attention — a song to play, a question to answer, anything.</Text>
        <TextInput
          value={requestMessage}
          onChangeText={setRequestMessage}
          placeholder="What's your request?"
          placeholderTextColor={colors.ink3}
          multiline
          maxLength={500}
          style={styles.requestInput}
        />
        <View style={styles.stepperRow}>
          <Text style={styles.stepperLabel}>XG:</Text>
          <TouchableOpacity style={styles.stepperButton} onPress={() => setRequestXg((v) => Math.max(MIN_REQUEST_XG, v - 10))}>
            <Text style={styles.stepperButtonText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.stepperValue}>{requestXg}</Text>
          <TouchableOpacity style={styles.stepperButton} onPress={() => setRequestXg((v) => v + 10)}>
            <Text style={styles.stepperButtonText}>+</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.submitRequestButton, (!requestMessage.trim() || requestBusy) && styles.submitRequestButtonDisabled]}
          onPress={sendRequest}
          disabled={!requestMessage.trim() || requestBusy}
        >
          <Text style={styles.submitRequestButtonText}>{requestBusy ? "Sending…" : `Send · ${requestXg} XG`}</Text>
        </TouchableOpacity>
      </BottomSheet>

      {!giftSheetOpen && addBalanceSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, paddingHorizontal: 24, gap: 12 },
  title: { color: colors.ink, fontSize: 22, fontFamily: fonts.serif, textAlign: "center" },
  subtitle: { color: colors.ink3, fontSize: 14, textAlign: "center" },
  primaryButton: { backgroundColor: colors.red, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8 },
  primaryButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  secondaryButton: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.line },
  countdownLabel: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginTop: 12 },
  countdown: { color: colors.ink, fontSize: 32, fontFamily: fonts.serif },
  noVideo: { alignItems: "center", justifyContent: "center", gap: 20 },
  waveform: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 40 },
  waveBar: { width: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.5)" },
  topScrim: { position: "absolute", left: 0, right: 0, top: 0, height: 160 },
  bottomScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "55%" },
  top: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  hostPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 16,
  },
  hostNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hostName: { color: "#fff", fontSize: 16, fontWeight: "800", flexShrink: 1 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.red, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  sessionTitle: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 1 },
  viewerCount: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: "auto" },
  viewerCountText: { color: "#fff", fontSize: 16 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  pinnedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pinnedBannerText: { color: "#fff", fontSize: 13, flex: 1, marginRight: 8 },
  pinnedBannerPrice: { color: "#fff", fontSize: 11, fontWeight: "700", backgroundColor: colors.red, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: "hidden" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingTop: 8 },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
    color: "#fff",
    fontSize: 16,
  },
  giftButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 2,
    borderColor: "rgba(225,29,46,0.7)",
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 999,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 16,
    shadowColor: colors.red,
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  giftButtonText: { color: "#fff", fontSize: 16, fontWeight: "500" },
  sheetHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  sheetTitle: { color: colors.ink, fontSize: 28, fontFamily: fonts.serif },
  balanceButton: { flexDirection: "row", alignItems: "center", gap: 6 },
  balanceText: { color: colors.amber, fontSize: 17, fontWeight: "700" },
  balancePlus: { color: colors.amber, fontSize: 22, marginLeft: 4 },
  giftGrid: { flexDirection: "row", gap: 8 },
  giftOption: { flex: 1, alignItems: "center", gap: 6, borderRadius: 16, borderWidth: 1, borderColor: "transparent", paddingVertical: 16 },
  giftOptionSelected: { borderColor: "rgba(225,29,46,0.6)", backgroundColor: "rgba(225,29,46,0.15)" },
  giftOptionLabel: { color: colors.ink2, fontSize: 14, fontWeight: "600" },
  giftOptionAmount: { color: colors.amber, fontSize: 13 },
  requestLink: { color: colors.ink3, fontSize: 13, textAlign: "center", marginTop: 16 },
  requestTitle: { color: colors.ink, fontSize: 24, fontFamily: fonts.serif, marginBottom: 4 },
  sheetSubtitle: { color: colors.ink3, fontSize: 12, marginBottom: 16 },
  requestInput: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  stepperLabel: { color: colors.ink3, fontSize: 12 },
  stepperButton: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  stepperButtonText: { color: colors.ink2, fontSize: 16 },
  stepperValue: { color: colors.amber, fontSize: 14, fontWeight: "700", width: 48, textAlign: "center" },
  submitRequestButton: { backgroundColor: colors.red, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  submitRequestButtonDisabled: { opacity: 0.5 },
  submitRequestButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
