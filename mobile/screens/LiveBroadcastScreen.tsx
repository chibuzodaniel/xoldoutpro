import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { LiveKitRoom, VideoTrack, useTracks, useDataChannel, useLocalParticipant, useRemoteParticipants } from "@livekit/react-native";
import { Track, type LocalVideoTrack } from "livekit-client";
import { useAuth } from "../lib/AuthContext";
import { apiGet, apiPatch, apiPost } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";
import type { GiftEvent, GiftMoment, LiveJoinResponse, LiveFeedItem, PendingLiveRequest } from "../lib/liveTypes";
import { appendGift, giftByType } from "../lib/liveTypes";
import { colors, fonts } from "../lib/theme";
import { useLiveAudioSession } from "../lib/liveAudio";
import { useToast } from "../components/ToastProvider";
import { GiftBanner, GiftCelebration, InitialsAvatar, LiveFeed, ShareLiveButton } from "../components/live/LiveBits";
import { isStageEvent, PeopleSheet, StageTiles, useStageState } from "../components/live/Stage";
import { CoinStatsSheet, SupportersSheet, useLiveSupport } from "../components/live/SupportSheets";
import {
  FloatingReactions,
  isLiveEmoji,
  ReactionBar,
  useEmojiUsage,
  useFloatingReactions,
  useReactionRateLimit,
} from "../components/live/reactions";
import {
  activeMentionQuery,
  extractMentions,
  filterCandidates,
  insertMention,
  MentionSuggestions,
  type MentionCandidate,
} from "../components/live/mentions";
import { CameraOffIcon, EyeIcon, FlipCameraIcon, MicLineIcon, RefreshIcon, XgCoin } from "../components/live/LiveIcons";

type SummaryResponse = {
  summary: { peakViewers: number; giftsXg: number; giftsCount: number; paidAccessXg: number; paidRequestsXg: number };
};

// How long the top banner + big celebration stay up after the latest gift.
const GIFT_MOMENT_MS = 3200;

const WELCOME_ITEM: LiveFeedItem = { kind: "system", id: "welcome", text: "You're live. Fans can watch, chat and send gifts." };

// The mobile broadcast screen — Xoldout Live's one camera-first, creator-
// only action (see lib/live/sessions.ts's own eligibility comment on the
// web side). Needs a real EAS dev build: @livekit/react-native's native
// WebRTC module isn't present in plain Expo Go (see App.tsx's registerGlobals
// try/catch and mobile's own Expo Go native-limits note).
export function LiveBroadcastScreen() {
  useLiveAudioSession("broadcaster");
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "LiveBroadcast">>();
  const { firebaseUser } = useAuth();
  const toast = useToast();
  const [join, setJoin] = useState<LiveJoinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  // Bumped on "Try again" to force <LiveKitRoom> to unmount/remount, which
  // is what actually re-attempts getUserMedia — it only requests devices
  // once, on mount.
  const [retryKey, setRetryKey] = useState(0);
  // Owned up here (not in BroadcastRoomContent) so the clock keeps running
  // across a "Try again" remount — the Live itself never stopped.
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser
      .getIdToken()
      .then((idToken) => apiGet<LiveJoinResponse>(`/api/live/${route.params.id}/join`, idToken))
      .then(setJoin)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not start broadcast"));
  }, [firebaseUser, route.params.id]);

  async function endLive() {
    if (!firebaseUser) return;
    try {
      const idToken = await firebaseUser.getIdToken();
      const data = await apiPost<SummaryResponse>(`/api/live/${route.params.id}/end`, idToken);
      toast.liveSummary(data.summary);
      navigation.navigate("LiveNow");
    } catch {
      navigation.navigate("LiveNow");
    }
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.errorButton}>
          <Text style={styles.errorButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!join) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  // A blocked camera keeps the room connected (chat/gifts still flow, the
  // header still shows) — the mockup's "Camera access is off" is an overlay
  // on the live screen, not a separate page.
  return (
    <LiveKitRoom
      key={retryKey}
      serverUrl={join.url}
      token={join.token}
      video
      audio
      connect
      onMediaDeviceFailure={() => setCameraBlocked(true)}
      onError={() => setCameraBlocked(true)}
    >
      <BroadcastRoomContent
        liveSessionId={route.params.id}
        startedAt={startedAtRef.current}
        cameraBlocked={cameraBlocked}
        onRetryCamera={() => {
          setCameraBlocked(false);
          setRetryKey((k) => k + 1);
        }}
        onEndLive={endLive}
      />
    </LiveKitRoom>
  );
}

function BroadcastRoomContent({
  liveSessionId,
  startedAt,
  cameraBlocked,
  onRetryCamera,
  onEndLive,
}: {
  liveSessionId: string;
  startedAt: number;
  cameraBlocked: boolean;
  onRetryCamera: () => void;
  onEndLive: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { firebaseUser } = useAuth();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  // People sheet (explicit asks, 2026-10-04): who's watching, adding them to
  // the stage, appointing moderators, and requests to join — see
  // components/live/Stage.tsx and web's lib/live/stage.ts.
  const [peopleOpen, setPeopleOpen] = useState(false);
  const { state: stage, refresh: refreshStage } = useStageState(liveSessionId);
  // Tappable "XG" and "supporters" chips (explicit ask, 2026-10-04) —
  // components/live/SupportSheets.tsx. supportVersion bumps on every gift so
  // an open sheet stays current.
  const [supportSheet, setSupportSheet] = useState<"supporters" | "coins" | null>(null);
  const [supportVersion, setSupportVersion] = useState(0);
  // Always loaded — the chips show the stream's full totals (paid access and
  // requests too), not only gifts seen since this screen opened. Paid joins
  // send no room event, so a slow poll picks those up.
  const support = useLiveSupport(liveSessionId, true, supportVersion);
  useEffect(() => {
    const id = setInterval(() => setSupportVersion((v) => v + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const refreshStageRef = useRef(refreshStage);
  useEffect(() => {
    refreshStageRef.current = refreshStage;
  }, [refreshStage]);
  useEffect(() => {
    refreshStage();
  }, [remoteParticipants.length, refreshStage]);
  const pendingStageRequests = stage?.requests.length ?? 0;
  const tracks = useTracks([Track.Source.Camera]);
  const selfTrack = tracks.find((t) => t.participant.identity === localParticipant.identity);
  const [feed, setFeed] = useState<LiveFeedItem[]>([WELCOME_ITEM]);
  const [giftTotals, setGiftTotals] = useState<{ xg: number; supporterIds: Set<string> }>({ xg: 0, supporterIds: new Set() });
  const [giftMoment, setGiftMoment] = useState<GiftMoment | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingLiveRequest[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [chatText, setChatText] = useState("");

  const myName = firebaseUser?.displayName ?? "You";

  // Stable callback refs — useDataChannel re-runs its internal setup effect
  // whenever `onMessage` changes identity, so an inline arrow function here
  // would tear down and resubscribe the room's data listener on every
  // incoming message (setFeed triggers a re-render → new inline fn →
  // resubscribe). useCallback with an empty dep array is safe since both
  // handlers only ever use the functional setState form, never closing over
  // stale `feed`.
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
        setSupportVersion((v) => v + 1);
        setGiftTotals((t) => ({
          xg: t.xg + (event.xgAmount ?? giftByType(event.giftType)?.xgAmount ?? 0),
          supporterIds: new Set(t.supporterIds).add(event.senderId),
        }));
      } else if (data.kind === "request") {
        setSupportVersion((v) => v + 1);
        setPendingRequests((r) => [...r, { id: data.requestId, senderName: data.senderName, message: data.message, xgAmount: data.xgAmount }]);
      } else if (isStageEvent(data)) {
        refreshStageRef.current();
        if (data.type === "requested") {
          setFeed((f) => [...f, { kind: "system", id: `${Date.now()}-${Math.random()}`, text: `${data.displayName ?? "Someone"} asked to join the Live` }]);
        }
      }
    } catch {
      // ignore malformed data messages
    }
  }, []);
  const { send: sendChatData } = useDataChannel("chat", onChatMessage);
  useDataChannel("live-event", onLiveEvent);

  // Emoji reactions (explicit ask, 2026-10-04) — components/live/reactions.tsx.
  const emojiUsage = useEmojiUsage();
  const { items: floatingItems, push: pushReaction } = useFloatingReactions();
  const allowReaction = useReactionRateLimit();
  const onReaction = useCallback(
    (msg: { payload: Uint8Array; from?: { identity: string } }) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(msg.payload));
        if (msg.from && allowReaction(msg.from.identity) && isLiveEmoji(data.emoji)) pushReaction(data.emoji);
      } catch {
        // ignore malformed data messages
      }
    },
    [allowReaction, pushReaction],
  );
  const { send: sendReactionData } = useDataChannel("reaction", onReaction);

  function sendReaction(emoji: string) {
    if (!allowReaction("self")) return;
    sendReactionData(new TextEncoder().encode(JSON.stringify({ emoji })), { topic: "reaction", reliable: false });
    pushReaction(emoji);
    emojiUsage.recordUse([emoji]);
  }

  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  useEffect(() => {
    if (!giftMoment) return;
    const key = giftMoment.key;
    const id = setTimeout(() => setGiftMoment((current) => (current?.key === key ? null : current)), GIFT_MOMENT_MS);
    return () => clearTimeout(id);
  }, [giftMoment]);

  function formatElapsed(sec: number) {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  async function toggleMic() {
    const next = !micEnabled;
    setMicEnabled(next);
    await localParticipant.setMicrophoneEnabled(next);
  }

  // Front/back swap — restartTrack re-acquires the camera with the new
  // facingMode on the same published track, so viewers don't drop.
  async function flipCamera() {
    const next = facingMode === "user" ? "environment" : "user";
    const track = localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
    if (!track) return;
    try {
      await track.restartTrack({ facingMode: next });
      setFacingMode(next);
    } catch {
      // No second camera — nothing to flip to.
    }
  }

  // Everyone in the Live the host can tag (explicit ask, 2026-10-04).
  const mentionCandidates: MentionCandidate[] = (stage?.watching ?? []).map((p) => ({
    userId: p.userId,
    handle: p.handle,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
  }));
  const mentionQuery = activeMentionQuery(chatText);
  const mentionMatches = mentionQuery === null ? [] : filterCandidates(mentionCandidates, mentionQuery);

  function sendChat() {
    const text = chatText.trim();
    if (!text) return;
    const mentions = extractMentions(text, mentionCandidates);
    const payload = new TextEncoder().encode(JSON.stringify({ senderName: myName, text, mentions }));
    sendChatData(payload, { topic: "chat", reliable: true });
    setFeed((f) => [...f, { kind: "chat", id: `${Date.now()}-${Math.random()}`, senderName: myName, text, mentions, fromHost: true }]);
    emojiUsage.recordFromText(text);
    setChatText("");
  }

  async function respondToRequest(requestId: string, accept: boolean) {
    if (!firebaseUser) return;
    setRespondingId(requestId);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPatch(`/api/live/${liveSessionId}/requests/${requestId}`, idToken, { accept });
    } finally {
      setPendingRequests((r) => r.filter((req) => req.id !== requestId));
      setRespondingId(null);
    }
  }

  const supporterCount = support?.supporters.length ?? giftTotals.supporterIds.size;

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#1f0a0e", "#120608", "#000"]} style={StyleSheet.absoluteFill} />
      {selfTrack && !cameraBlocked && (
        <VideoTrack trackRef={selfTrack} style={StyleSheet.absoluteFill} objectFit="cover" mirror={facingMode === "user"} />
      )}

      {cameraBlocked && (
        <View style={[StyleSheet.absoluteFill, styles.cameraOff]}>
          <View style={styles.cameraOffCircle}>
            <CameraOffIcon size={36} />
          </View>
          <Text style={styles.cameraOffTitle}>Camera access is off</Text>
          <Text style={styles.cameraOffSubtitle}>Allow camera and microphone for Xoldout in your settings, then try again.</Text>
          <TouchableOpacity style={styles.tryAgainButton} onPress={onRetryCamera}>
            <RefreshIcon size={18} />
            <Text style={styles.tryAgainButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}

      <StageTiles
        people={stage?.onStage ?? []}
        selfId={localParticipant.identity}
        host={{ userId: localParticipant.identity, displayName: myName, avatarUrl: null }}
        mirrorSelf={facingMode === "user"}
      />

      <LinearGradient colors={["rgba(0,0,0,0.55)", "transparent"]} style={styles.topScrim} pointerEvents="none" />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.9)"]} style={styles.bottomScrim} pointerEvents="none" />

      {giftMoment && <GiftCelebration key={giftMoment.key} moment={giftMoment} />}
      <FloatingReactions items={floatingItems} />


      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <View style={styles.hostPill}>
            <InitialsAvatar name={myName} size={44} />
            <View>
              <View style={styles.hostNameRow}>
                <Text style={styles.hostName}>You&apos;re live</Text>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
              </View>
              <Text style={styles.elapsedText}>{formatElapsed(elapsed)}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.viewerCount}
            onPress={() => {
              setPeopleOpen(true);
              refreshStage();
            }}
            accessibilityLabel="See who's watching and requests to join"
          >
            <EyeIcon size={18} />
            <Text style={styles.viewerCountText}>{remoteParticipants.length.toLocaleString("en-NG")}</Text>
            {pendingStageRequests > 0 && (
              <View style={styles.requestBadge}>
                <Text style={styles.requestBadgeText}>{pendingStageRequests}</Text>
              </View>
            )}
          </TouchableOpacity>
          <ShareLiveButton liveSessionId={liveSessionId} message={`${myName} is live on XOLDOUT — join now`} />
        </View>

        <View style={styles.statRow}>
          <TouchableOpacity style={styles.statChip} onPress={() => setSupportSheet("coins")} accessibilityLabel="See the coins received in this stream">
            <XgCoin size={16} />
            <Text style={styles.statXg}>{(support?.totalXg ?? giftTotals.xg).toLocaleString("en-NG")} XG ›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statChip} onPress={() => setSupportSheet("supporters")} accessibilityLabel="See who supported you">
            <Text style={styles.statSupporters}>
              {supporterCount} supporter{supporterCount === 1 ? "" : "s"} ›
            </Text>
          </TouchableOpacity>
        </View>

        {giftMoment && (
          <View style={{ marginTop: 10 }}>
            <GiftBanner key={giftMoment.key} moment={giftMoment} isSelf={false} />
          </View>
        )}
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {pendingRequests.length > 0 && (
          <View style={styles.requestsWrap}>
            {pendingRequests.map((r) => (
              <View key={r.id} style={styles.requestCard}>
                <Text style={styles.requestText}>
                  <Text style={styles.requestSender}>{r.senderName}</Text> · <Text style={styles.requestAmount}>{r.xgAmount} XG request</Text>
                  {"\n"}
                  {r.message}
                </Text>
                <View style={styles.requestActions}>
                  <TouchableOpacity style={styles.acceptButton} disabled={respondingId === r.id} onPress={() => respondToRequest(r.id, true)}>
                    <Text style={styles.acceptButtonText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.declineButton} disabled={respondingId === r.id} onPress={() => respondToRequest(r.id, false)}>
                    <Text style={styles.declineButtonText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        <LiveFeed items={feed} selfId={null} />

        <MentionSuggestions candidates={mentionMatches} onPick={(c) => setChatText((t) => insertMention(t, c))} />

        <ReactionBar ordered={emojiUsage.ordered} onReact={sendReaction} />

        <View style={styles.inputRow}>
          <TextInput
            value={chatText}
            onChangeText={setChatText}
            onSubmitEditing={sendChat}
            placeholder="Say something… type @ to tag"
            placeholderTextColor="rgba(255,255,255,0.5)"
            style={styles.chatInput}
          />
          <TouchableOpacity onPress={toggleMic} hitSlop={8} accessibilityLabel={micEnabled ? "Mute microphone" : "Unmute microphone"}>
            <MicLineIcon size={24} muted={!micEnabled} />
          </TouchableOpacity>
          <TouchableOpacity onPress={flipCamera} hitSlop={8} accessibilityLabel="Flip camera">
            <FlipCameraIcon size={24} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.endButton} onPress={onEndLive}>
          <Text style={styles.endButtonText}>End live</Text>
        </TouchableOpacity>
      </View>
      <SupportersSheet data={support} visible={supportSheet === "supporters"} onClose={() => setSupportSheet(null)} />
      <CoinStatsSheet data={support} visible={supportSheet === "coins"} onClose={() => setSupportSheet(null)} />

      {stage && (
        <PeopleSheet liveId={liveSessionId} state={stage} visible={peopleOpen} onRefresh={refreshStage} onClose={() => setPeopleOpen(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  requestBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  requestBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  container: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  errorText: { color: colors.redSoft, fontSize: 14, marginBottom: 12 },
  errorButton: { paddingHorizontal: 16, paddingVertical: 8 },
  errorButtonText: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  cameraOff: { alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  cameraOffCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(225,29,46,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
    shadowColor: colors.red,
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  cameraOffTitle: { color: colors.ink, fontSize: 30, fontFamily: fonts.serif, textAlign: "center" },
  cameraOffSubtitle: { color: "rgba(255,255,255,0.55)", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 12 },
  tryAgainButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 24,
  },
  tryAgainButtonText: { color: colors.ink, fontSize: 16 },
  topScrim: { position: "absolute", left: 0, right: 0, top: 0, height: 170 },
  bottomScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "50%" },
  top: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  hostPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 16,
  },
  hostNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hostName: { color: "#fff", fontSize: 16, fontWeight: "800" },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.red, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  elapsedText: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 1, fontVariant: ["tabular-nums"] },
  viewerCount: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: "auto" },
  viewerCountText: { color: "#fff", fontSize: 16 },
  statRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  statChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  statXg: { color: colors.amber, fontSize: 14, fontWeight: "700" },
  statSupporters: { color: "#fff", fontSize: 14, fontWeight: "500" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  requestsWrap: { maxHeight: 180, paddingHorizontal: 12, marginBottom: 8, gap: 8 },
  requestCard: { borderWidth: 1, borderColor: "rgba(217,154,43,0.4)", backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 12, padding: 10 },
  requestText: { color: "rgba(255,255,255,0.9)", fontSize: 13, marginBottom: 8 },
  requestSender: { fontWeight: "700" },
  requestAmount: { color: colors.amber },
  requestActions: { flexDirection: "row", gap: 8 },
  acceptButton: { backgroundColor: colors.red, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  acceptButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  declineButton: { borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  declineButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 12, paddingTop: 8 },
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
  endButton: { alignSelf: "center", paddingHorizontal: 24, paddingVertical: 10, marginTop: 8 },
  endButtonText: { color: colors.ink, fontSize: 17 },
});
