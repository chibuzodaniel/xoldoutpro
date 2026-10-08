import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { VideoTrack, useTracks, useDataChannel, useLocalParticipant, useRemoteParticipants } from "@livekit/react-native";
import { Track } from "livekit-client";
import { useAuth } from "../lib/AuthContext";
import { apiDelete, apiGet, apiPost } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";
import type { GiftEvent, GiftMoment, LiveJoinResponse, LiveFeedItem } from "../lib/liveTypes";
import { appendGift, GIFT_CATALOG, type GiftType } from "../lib/liveTypes";
import { colors, fonts } from "../lib/theme";
import { useLiveRoom } from "../lib/LiveRoomContext";
import { AddBalance, BottomSheet, GiftBanner, GiftCelebration, InitialsAvatar, LiveFeed, ShareLiveButton } from "../components/live/LiveBits";
import { ChevronDownIcon, CloseIcon, EyeIcon, GiftArt, MicLineIcon, XgCoin } from "../components/live/LiveIcons";
import { isStageEvent, PeopleSheet, StageTiles, useStageActions, useStageState, type StageEvent } from "../components/live/Stage";
import { LiveShareButtons } from "../components/live/LiveShareButtons";
import { BattleBar, BattleDetailsSheet, isBattleActive, isBattleEvent, isBattleShown, useBattle } from "../components/live/Battle";
import { useToast } from "../components/ToastProvider";
import { TopGifterChip, TopGiftersSheet, useTopGifters } from "../components/live/TopGifters";
import {
  FloatingReactions,
  isLiveEmoji,
  ReactionBar,
  useEmojiUsage,
  useFloatingReactions,
  useReactionRateLimit,
} from "../components/live/reactions";

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
  // Switches to the voice-call audio profile while this viewer is on stage
  // (co-hosting) so their microphone is captured properly.
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "LiveViewer">>();
  const { firebaseUser } = useAuth();
  // The room itself lives at the app root (lib/LiveRoomContext.tsx) so the
  // Live keeps playing in the mini player when the viewer leaves this screen.
  const live = useLiveRoom();
  const mine = live.active?.liveId === route.params.id ? live.active : null;
  // Connected at some point — so losing the connection means the Live ended.
  const [hadLive, setHadLive] = useState(!!mine);
  useEffect(() => {
    if (mine) setHadLive(true);
  }, [mine]);
  useFocusEffect(
    useCallback(() => {
      live.setVisibleLiveId(route.params.id);
      return () => live.setVisibleLiveId(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route.params.id]),
  );
  const [join, setJoin] = useState<LiveJoinResponse | null>(mine?.join ?? null);
  const [status, setStatus] = useState<"loading" | "needs-payment" | "ended" | "ready" | "scheduled">(mine ? "ready" : "loading");
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
    // Already connected (back from the mini player) — reuse it.
    if (live.active?.liveId === route.params.id) return;
    // The user's own Live is running minimised — don't cut it off.
    if (live.active?.role === "host") {
      Alert.alert("You're live right now", "End your Live before watching another one.");
      navigation.goBack();
      return;
    }
    const idToken = await firebaseUser.getIdToken();
    try {
      const data = await apiGet<LiveJoinResponse>(`/api/live/${route.params.id}/join`, idToken);
      setJoin(data);
      live.start({ liveId: route.params.id, role: "viewer", join: data, startedAt: Date.now() });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, route.params.id]);

  useEffect(() => {
    attemptJoin();
  }, [attemptJoin]);

  // While scheduled: tick the countdown, and re-try joining every 15s so the
  // screen drops into the Live by itself the moment the host starts.
  useEffect(() => {
    if (status !== "scheduled") return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    // Only re-checks from 5 minutes before the start time, every 30s, while
    // the app is in front (Vercel CPU budget — see CLAUDE.md).
    const startsAt = scheduled?.scheduledFor ? new Date(scheduled.scheduledFor).getTime() : null;
    const poll = setInterval(() => {
      if (AppState.currentState !== "active") return;
      if (startsAt && Date.now() < startsAt - 5 * 60_000) return;
      attemptJoin();
    }, 30_000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [status, attemptJoin, scheduled?.scheduledFor]);

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

  if (status === "ended" || !join || (!mine && hadLive)) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>This Live has ended</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate("LiveNow")}>
          <Text style={styles.primaryButtonText}>Back to Live</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!mine) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <ViewerRoomContent
      liveSessionId={route.params.id}
      session={join.session}
      hostId={join.hostId}
      onStageChange={live.setOnStage}
      onClose={() => {
        live.stop();
        navigation.navigate("LiveNow");
      }}
      onMinimize={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Tabs"))}
    />
  );
}

function ViewerRoomContent({
  liveSessionId,
  session,
  hostId,
  onStageChange,
  onClose,
  onMinimize,
}: {
  liveSessionId: string;
  session?: LiveJoinResponse["session"];
  hostId?: string;
  onStageChange: (onStage: boolean) => void;
  onClose: () => void;
  onMinimize: () => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { localParticipant } = useLocalParticipant();
  // LiveKit identity is the viewer's own user id (web's lib/live/liveKit.ts
  // token minting), which is what gift events' senderId is compared against.
  const selfId = localParticipant.identity;
  const remoteParticipants = useRemoteParticipants();
  const tracks = useTracks([Track.Source.Camera]);
  // Guests on stage render as tiles (StageTiles), never in the host's spot.
  const hostTrack = tracks.find((t) => (hostId ? t.participant.identity === hostId : t.participant.identity !== localParticipant.identity));
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
  const { firebaseUser, appUser } = useAuth();
  const toast = useToast();

  // Co-hosting (explicit ask, 2026-10-04) — mirrors web's viewer page.
  const { state: stage, refresh: refreshStage } = useStageState(liveSessionId);
  const stageActions = useStageActions(liveSessionId, refreshStage, stage?.maxGuests);
  const [peopleOpen, setPeopleOpen] = useState(false);
  // Top gifter chip + leaderboard (explicit ask, 2026-10-04); giftVersion
  // bumps on every gift.
  const [giftVersion, setGiftVersion] = useState(0);
  const [topGiftersOpen, setTopGiftersOpen] = useState(false);
  const topGifters = useTopGifters(liveSessionId, giftVersion);
  // Live battles (explicit ask, 2026-10-08) — components/live/Battle.tsx.
  const battleState = useBattle(liveSessionId);
  const { battle } = battleState;
  const [battleDetailsOpen, setBattleDetailsOpen] = useState(false);
  // Who a gift goes to while a battle runs: a competitor's id, or null = the host.
  const [giftTarget, setGiftTarget] = useState<string | null>(null);
  const battleRef = useRef(battleState);
  useEffect(() => {
    battleRef.current = battleState;
  }, [battleState]);
  const [invitedBy, setInvitedBy] = useState<string | null>(null);
  const [stageMicOn, setStageMicOn] = useState(true);
  const meOnStage = stage?.onStage.some((p) => p.userId === selfId) ?? false;
  const isStaff = stage?.role === "moderator" || stage?.role === "host";

  useEffect(() => {
    onStageChange(meOnStage);
  }, [meOnStage, onStageChange]);
  useEffect(() => {
    refreshStage();
  }, [remoteParticipants.length, refreshStage]);

  // The permission update and the data message announcing it travel
  // separately, so a couple of short retries cover the message arriving first.
  const goOnStage = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await localParticipant.setCameraEnabled(true);
        await localParticipant.setMicrophoneEnabled(true);
        setStageMicOn(true);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
    toast.error("Couldn't turn on your camera or microphone. Check the app's permissions.");
  }, [localParticipant, toast]);

  const stopPublishing = useCallback(async () => {
    await localParticipant.setCameraEnabled(false).catch(() => {});
    await localParticipant.setMicrophoneEnabled(false).catch(() => {});
  }, [localParticipant]);

  const stageEventRef = useRef<(data: StageEvent) => void>(() => {});
  useEffect(() => {
    stageEventRef.current = (data) => {
      refreshStage();
      if (data.userId !== selfId) return;
      if (data.kind === "roles") {
        toast.success(data.type === "moderator-added" ? "The host made you a moderator of this Live." : "You're no longer a moderator of this Live.");
        return;
      }
      if (data.type === "approved") {
        toast.success("You're on the Live!");
        goOnStage();
      } else if (data.type === "invited") {
        setInvitedBy(data.byName ?? "The host");
      } else if (data.type === "declined") {
        toast.error("Your request to join wasn't accepted this time.");
      } else if (data.type === "removed") {
        setInvitedBy(null);
        stopPublishing();
        toast.success("You've been taken off the stage.");
      }
    };
  }, [refreshStage, selfId, goOnStage, stopPublishing, toast]);

  async function toggleStageMic() {
    const next = !stageMicOn;
    setStageMicOn(next);
    await localParticipant.setMicrophoneEnabled(next).catch(() => {});
  }

  async function leaveStage() {
    setInvitedBy(null);
    await stopPublishing();
    await stageActions.self("leave", "You've left the stage.");
  }

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
  // @-mentions only count from the host's own connection (explicit ask,
  // 2026-10-04: the host can tag people in the comments). Refs keep this
  // callback stable for useDataChannel.
  const chatContextRef = useRef({ hostId, selfId, notify: (name: string) => toast.success(`${name} mentioned you`) });
  useEffect(() => {
    chatContextRef.current = { hostId, selfId, notify: (name: string) => toast.success(`${name} mentioned you`) };
  }, [hostId, selfId, toast]);
  const onChatMessage = useCallback((msg: { payload: Uint8Array; from?: { identity: string; name?: string } }) => {
    const text = new TextDecoder().decode(msg.payload);
    try {
      const data = JSON.parse(text);
      const ctx = chatContextRef.current;
      const fromHost = !!msg.from && !!ctx.hostId && msg.from.identity === ctx.hostId;
      const mentions = fromHost && Array.isArray(data.mentions) ? data.mentions : undefined;
      const mentionsMe = !!mentions?.some((m: { userId: string }) => m.userId === ctx.selfId);
      setFeed((f) => [
        ...f,
        { kind: "chat", id: `${Date.now()}-${Math.random()}`, senderName: msg.from?.name || data.senderName, text: data.text, mentions, fromHost, mentionsMe },
      ]);
      if (mentionsMe) ctx.notify(msg.from?.name || data.senderName);
    } catch {
      // ignore malformed data messages
    }
  }, []);
  const onLiveEvent = useCallback((msg: { payload: Uint8Array }) => {
    const text = new TextDecoder().decode(msg.payload);
    try {
      const data = JSON.parse(text);
      if (isBattleEvent(data)) {
        battleRef.current.refresh();
      } else if (data.kind === "gift") {
        setGiftVersion((v) => v + 1);
        if (data.competitorId) battleRef.current.bumpGift(data.competitorId, data.xgAmount);
        const event = data as GiftEvent;
        setFeed((f) => {
          const { feed: next, count } = appendGift(f, event);
          setGiftMoment({ key: event.giftId, giftType: event.giftType, label: event.label, senderName: event.senderName, senderId: event.senderId, count });
          return next;
        });
      } else if (data.kind === "request") {
        setFeed((f) => [...f, { kind: "request", id: data.requestId, senderName: data.senderName, message: data.message, xgAmount: data.xgAmount }]);
      } else if (isStageEvent(data)) {
        stageEventRef.current(data);
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

  function sendChat() {
    const text = chatText.trim();
    if (!text) return;
    // Display names everywhere in a Live (explicit ask, 2026-10-05: "every
    // user should be known by display name on Live, not switching between
    // display name and username"). Received chat uses the sender's LiveKit
    // participant name — set server-side from their XOLDOUT display name when
    // they joined (lib/live/liveKit.ts) — rather than whatever name the sender's
    // app put in the message; sending uses the XOLDOUT display name too, never
    // the sign-in (Firebase) account's name.
    const senderName = appUser?.displayName ?? "Viewer";
    const payload = new TextEncoder().encode(JSON.stringify({ senderName, text }));
    sendChatData(payload, { topic: "chat", reliable: true });
    setFeed((f) => [...f, { kind: "chat", id: `${Date.now()}-${Math.random()}`, senderName: "You", text }]);
    emojiUsage.recordFromText(text);
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
      const competitorId = isBattleActive(battle) && giftTarget && battle.competitors.some((c) => c.id === giftTarget) ? giftTarget : undefined;
      await apiPost(`/api/live/${liveSessionId}/gifts`, idToken, { giftType, competitorId });
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

      <StageTiles
        people={stage?.onStage ?? []}
        selfId={selfId}
        host={{ userId: hostId ?? stage?.hostId ?? "", displayName: creatorName || "Host", avatarUrl: session?.creator.avatarUrl ?? null }}
      />

      <LinearGradient colors={["rgba(0,0,0,0.55)", "transparent"]} style={styles.topScrim} pointerEvents="none" />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.85)"]} style={styles.bottomScrim} pointerEvents="none" />

      {giftMoment && <GiftCelebration key={giftMoment.key} moment={giftMoment} />}
      <FloatingReactions items={floatingItems} />


      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onMinimize} hitSlop={10} accessibilityLabel="Minimise — keep watching while you use the app">
            <ChevronDownIcon size={26} />
          </TouchableOpacity>
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
          {isStaff && (
            <TouchableOpacity
              style={styles.peopleButton}
              onPress={() => {
                setPeopleOpen(true);
                refreshStage();
              }}
              accessibilityLabel="People and requests to join"
            >
              <Text style={styles.peopleButtonText}>People</Text>
              {(stage?.requests.length ?? 0) > 0 && (
                <View style={styles.requestBadge}>
                  <Text style={styles.requestBadgeText}>{stage?.requests.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          <LiveShareButtons liveSessionId={liveSessionId} message={`${creatorName} is live on XOLDOUT — join now`} />
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Leave Live">
            <CloseIcon size={24} />
          </TouchableOpacity>
        </View>
        <TopGifterChip top={topGifters[0]} selfId={selfId} onOpen={() => setTopGiftersOpen(true)} />
        {isBattleShown(battle) && (
          <BattleBar
            battle={battle}
            skewMs={battleState.skewMs}
            isHost={false}
            act={battleState.act}
            onDismiss={battleState.dismiss}
            onSupport={(competitorId) => {
              setGiftTarget(competitorId);
              openGiftSheet();
            }}
            onOpenDetails={() => {
              battleState.refresh();
              setBattleDetailsOpen(true);
            }}
          />
        )}
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

        {meOnStage && (
          <View style={styles.onStageBar}>
            <View style={styles.onStageDot} />
            <Text style={styles.onStageText}>You're on the Live</Text>
            <TouchableOpacity style={styles.onStageMic} onPress={toggleStageMic} accessibilityLabel={stageMicOn ? "Mute your microphone" : "Unmute your microphone"}>
              <MicLineIcon size={20} muted={!stageMicOn} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.leaveStageButton} onPress={leaveStage}>
              <Text style={styles.leaveStageText}>Leave stage</Text>
            </TouchableOpacity>
          </View>
        )}

        <ReactionBar ordered={emojiUsage.ordered} onReact={sendReaction} />

        <View style={styles.inputRow}>
          <TextInput
            value={chatText}
            onChangeText={setChatText}
            onSubmitEditing={sendChat}
            placeholder="Say something…"
            placeholderTextColor="rgba(255,255,255,0.75)"
            style={styles.chatInput}
          />
          {stage && !meOnStage && stage.role !== "host" && (
            <TouchableOpacity
              style={[styles.joinButton, stage.myRequestStatus === "PENDING" && styles.joinButtonPending]}
              disabled={stageActions.busyKey !== null}
              onPress={() =>
                stage.myRequestStatus === "PENDING"
                  ? stageActions.self("cancel", "Request cancelled.")
                  : stageActions.self("request", "Request sent — the host or a moderator will let you in.")
              }
              accessibilityLabel={stage.myRequestStatus === "PENDING" ? "Cancel your request to join" : "Request to join the Live"}
            >
              <Text style={styles.joinButtonText}>{stage.myRequestStatus === "PENDING" ? "✋ Requested" : "✋ Join"}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.giftButton} onPress={openGiftSheet}>
            <GiftArt type="GRAMMY" size={24} />
            <Text style={styles.giftButtonText}>Gift</Text>
          </TouchableOpacity>
        </View>
      </View>

      <BattleDetailsSheet battle={battle} visible={battleDetailsOpen} onClose={() => setBattleDetailsOpen(false)} />

      <TopGiftersSheet gifters={topGifters} selfId={selfId} visible={topGiftersOpen} onClose={() => setTopGiftersOpen(false)} />

      {stage && isStaff && (
        <PeopleSheet liveId={liveSessionId} state={stage} visible={peopleOpen} onRefresh={refreshStage} onClose={() => setPeopleOpen(false)} />
      )}

      <BottomSheet visible={!!invitedBy && meOnStage} onClose={() => undefined}>
        <Text style={styles.sheetTitle}>You've been added to the Live</Text>
        <Text style={styles.inviteBody}>{invitedBy} brought you on stage. Everyone watching will see and hear you.</Text>
        <TouchableOpacity
          style={styles.inviteGoLive}
          onPress={() => {
            setInvitedBy(null);
            goOnStage();
          }}
        >
          <Text style={styles.inviteGoLiveText}>Turn on camera & mic</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.inviteNotNow} onPress={leaveStage}>
          <Text style={styles.inviteNotNowText}>Not now</Text>
        </TouchableOpacity>
      </BottomSheet>

      <BottomSheet visible={giftSheetOpen} onClose={() => setGiftSheetOpen(false)}>
        <View style={styles.sheetHeaderRow}>
          <Text style={styles.sheetTitle}>Send a gift</Text>
          <TouchableOpacity style={styles.balanceButton} onPress={() => setAddBalanceOpen(true)}>
            <XgCoin size={20} />
            <Text style={styles.balanceText}>{balanceXg === null ? "…" : balanceXg.toLocaleString("en-NG")} XG</Text>
            <Text style={styles.balancePlus}>+</Text>
          </TouchableOpacity>
        </View>
        {isBattleActive(battle) && (
          <View style={{ marginBottom: 14 }}>
            <Text style={styles.sendToLabel}>SEND TO</Text>
            <View style={styles.sendToRow}>
              {[{ id: null as string | null, name: `${creatorName || "Host"} (host)` }, ...battle.competitors.filter((c) => c.user.id !== selfId).map((c) => ({ id: c.id as string | null, name: c.user.displayName }))].map((t) => (
                <TouchableOpacity key={t.id ?? "host"} onPress={() => setGiftTarget(t.id)} style={[styles.sendToChip, giftTarget === t.id && styles.sendToChipOn]}>
                  <Text style={[styles.sendToChipText, giftTarget === t.id && { color: "#fff" }]}>{t.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
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
  peopleButton: { borderRadius: 999, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 10, paddingVertical: 5 },
  peopleButtonText: { color: "#fff", fontSize: 13, fontWeight: "600" },
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
  onStageBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
  },
  onStageDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
  onStageText: { flex: 1, color: "#fff", fontSize: 13, fontWeight: "600" },
  onStageMic: { borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)", padding: 6 },
  leaveStageButton: { borderRadius: 999, backgroundColor: colors.red, paddingHorizontal: 12, paddingVertical: 6 },
  leaveStageText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  joinButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  joinButtonPending: { borderColor: "rgba(217,154,43,0.6)", backgroundColor: "rgba(217,154,43,0.15)" },
  joinButtonText: { color: "#fff", fontSize: 14, fontWeight: "500" },
  inviteBody: { color: colors.ink3, fontSize: 14, marginBottom: 20 },
  inviteGoLive: { backgroundColor: colors.red, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginBottom: 8 },
  inviteGoLiveText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  inviteNotNow: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  inviteNotNowText: { color: colors.ink2, fontSize: 14, fontWeight: "600" },
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
  sendToLabel: { fontSize: 12, color: colors.ink3, letterSpacing: 0.5, marginBottom: 8 },
  sendToRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sendToChip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  sendToChipOn: { borderColor: colors.red, backgroundColor: "rgba(225,29,46,0.2)" },
  sendToChipText: { color: colors.ink2, fontSize: 13, fontWeight: "700" },
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
  sessionTitle: { color: "rgba(255,255,255,0.9)", fontSize: 13, marginTop: 1 },
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
