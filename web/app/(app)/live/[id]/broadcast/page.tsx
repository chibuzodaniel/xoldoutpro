"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Room, RoomEvent, Track, type LocalVideoTrack } from "livekit-client";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/ToastProvider";
import { InitialsAvatar } from "@/components/live/LiveCard";
import { CameraOffIcon, EyeIcon, FlipCameraIcon, MicLineIcon, RefreshIcon, XgCoin } from "@/components/live/LiveIcons";
import { giftByType } from "@/components/live/giftCatalog";
import { appendGift, GiftBanner, GiftCelebration, LiveFeed, type FeedItem, type GiftMoment } from "@/components/live/LiveFeed";
import { LiveChatInput } from "@/components/live/LiveChatInput";
import { ShareButton } from "@/components/ui/ShareButton";
import { isStageEvent, PeopleSheet, StageTiles, useStageState } from "@/components/live/stage";
import { CoinStatsSheet, SupportersSheet, useLiveSupport } from "@/components/live/SupportSheets";
import { BattleBar, BattleDetailsSheet, BattleSetupSheet, isBattleEvent, isBattleShown, useBattle } from "@/components/live/battle";
import {
  FloatingReactions,
  LIVE_EMOJIS,
  ReactionBar,
  useEmojiUsage,
  useFloatingReactions,
  useReactionRateLimit,
} from "@/components/live/reactions";
import { unlockGiftSounds } from "@/components/live/giftSound";
import {
  activeMentionQuery,
  extractMentions,
  filterCandidates,
  insertMention,
  MentionSuggestions,
  type MentionCandidate,
} from "@/components/live/mentions";

type PendingRequest = { id: string; senderName: string; message: string; xgAmount: number };

// How long the top "X sent Y" banner and the big celebration stay up after
// the most recent gift — matches .animate-gift-banner's 3.2s in globals.css.
const GIFT_MOMENT_MS = 3200;

const WELCOME_ITEM: FeedItem = { kind: "system", id: "welcome", text: "You're live. Fans can watch, chat and send gifts." };

// Web's broadcast screen — same getUserMedia-publish shape mobile's
// LiveBroadcastScreen gets from @livekit/react-native, using livekit-client
// directly (Room.localParticipant.setCameraEnabled/setMicrophoneEnabled).
// Chat/gift feed rides the exact same "chat"/"live-event" data-channel
// topics as the viewer page and mobile, so everyone watching the same Live
// sees the same messages regardless of platform.
//
// The video container below is ALWAYS mounted (never conditionally
// rendered on `status`) — connect() attaches the local camera track to it
// directly. Earlier this container only rendered once status flipped to
// "live", but the attach happened *before* that flip, so the ref was still
// null at attach time and the attach silently no-op'd — camera published
// fine (viewers could see it), the broadcaster's own preview just never
// appeared. Keeping the container permanently mounted, with connecting/
// error states as overlays instead of early returns, is what actually
// fixes that — not a timing hack, since refs commit before this effect
// even starts running.
export default function LiveBroadcastPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { firebaseUser, appUser, loading: authLoading } = useAuth();
  const toast = useToast();
  const videoContainerRef = useRef<HTMLVideoElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const [status, setStatus] = useState<"connecting" | "live" | "camera-blocked" | "ended" | "error">("connecting");
  const [feed, setFeed] = useState<FeedItem[]>([WELCOME_ITEM]);
  const [giftTotals, setGiftTotals] = useState<{ xg: number; supporterIds: Set<string> }>({ xg: 0, supporterIds: new Set() });
  const [giftMoment, setGiftMoment] = useState<GiftMoment | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  // People sheet (explicit asks: the host sees who's in their Live, can add
  // any of them to the stage, appoint moderators, and handle requests to
  // join) — see components/live/stage.tsx and lib/live/stage.ts.
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  // Tappable "XG" and "supporters" chips (explicit ask, 2026-10-04) —
  // components/live/SupportSheets.tsx. supportVersion bumps on every gift so
  // an open sheet stays current.
  const [supportSheet, setSupportSheet] = useState<"supporters" | "coins" | null>(null);
  const [supportVersion, setSupportVersion] = useState(0);
  // Always loaded (not just while a sheet is open) — the chips show the
  // stream's full totals, including paid access and requests, not only the
  // gifts this page happened to see since it opened. Paid joins send no
  // room event, so a slow poll picks those up.
  const support = useLiveSupport(params.id, room !== null, supportVersion);
  useEffect(() => {
    if (!room) return;
    const id = setInterval(() => setSupportVersion((v) => v + 1), 60_000);
    return () => clearInterval(id);
  }, [room]);
  // Emoji reactions (explicit ask, 2026-10-04) — components/live/reactions.tsx.
  const emojiUsage = useEmojiUsage();
  const floating = useFloatingReactions();
  const allowReaction = useReactionRateLimit();
  // Gift sounds need one tap on the page before the browser lets them play.
  useEffect(() => unlockGiftSounds(), []);
  const { state: stage, refresh: refreshStage } = useStageState(params.id, room !== null);
  // The room event handlers are registered once, inside the connect effect.
  // Live battles (explicit ask, 2026-10-08) — components/live/battle.tsx.
  const battleState = useBattle(params.id, room !== null);
  const { battle } = battleState;
  const [battleSheet, setBattleSheet] = useState<"setup" | "details" | null>(null);
  const [hostXg, setHostXg] = useState<number | null>(null);
  const battleRef = useRef(battleState);
  useEffect(() => {
    battleRef.current = battleState;
  }, [battleState]);
  const battleRunning = !!battle && (battle.status === "READY" || battle.status === "IN_PROGRESS" || battle.status === "VOTING");
  async function openBattleSetup() {
    setBattleSheet("setup");
    void refreshStage();
    const res = await apiFetch("/api/coins").catch(() => null);
    if (res?.ok) setHostXg((await res.json()).balanceXg);
  }
  const refreshStageRef = useRef(refreshStage);
  useEffect(() => {
    refreshStageRef.current = refreshStage;
  }, [refreshStage]);
  // Guests' audio (once someone is on stage the host has to hear them).
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [chatText, setChatText] = useState("");
  const [retryTick, setRetryTick] = useState(0);

  // Display names everywhere in a Live (explicit ask, 2026-10-05: "every
  // user should be known by display name on Live, not switching between
  // display name and username"). Received chat uses the sender's LiveKit
  // participant name — set server-side from their XOLDOUT display name when
  // they joined (lib/live/liveKit.ts) — rather than whatever name the sender's
  // app put in the message; sending uses the XOLDOUT display name too, never
  // the sign-in (Firebase) account's name.
  const myName = appUser?.displayName ?? "Host";

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.push(`/login?next=/live/${params.id}/broadcast`);
      return;
    }

    // React StrictMode double-invokes this effect in dev (mount → cleanup →
    // mount again), and `connect` is async fire-and-forget — without this
    // guard, the first invocation's in-flight room.connect()/
    // setCameraEnabled() calls kept running after cleanup, racing a second
    // room for the same identity ("could not createOffer with closed peer
    // connection" / "skipping incoming track after Room disconnected").
    // Checking `cancelled` after every await, and never touching `roomRef`
    // until the very end, means a cancelled run's room gets torn down
    // instead of racing a fresh one — the same discipline production needs
    // too, for a user who navigates away mid-connect.
    let cancelled = false;
    let localRoom: Room | null = null;

    async function connect() {
      const res = await apiFetch(`/api/live/${params.id}/join`);
      if (cancelled) return;
      if (!res.ok) {
        setStatus(res.status === 404 ? "ended" : "error");
        return;
      }
      const { token, url, isHost } = await res.json();
      if (cancelled) return;
      if (!isHost) {
        router.replace(`/live/${params.id}`);
        return;
      }

      const room = new Room();
      localRoom = room;

      const updateViewers = () => {
        setViewerCount(room.remoteParticipants.size);
        void refreshStageRef.current();
      };
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        el.setAttribute("playsinline", "true");
        audioContainerRef.current?.appendChild(el);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) track.detach().forEach((el) => el.remove());
      });
      room.on(RoomEvent.ParticipantConnected, updateViewers);
      room.on(RoomEvent.ParticipantDisconnected, updateViewers);
      room.on(RoomEvent.Disconnected, () => setStatus("ended"));
      room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        const text = new TextDecoder().decode(payload);
        try {
          const data = JSON.parse(text);
          if (topic === "reaction") {
            if (participant && allowReaction(participant.identity) && (LIVE_EMOJIS as readonly string[]).includes(data.emoji)) {
              floating.push(data.emoji);
            }
          } else if (topic === "chat") {
            setFeed((f) => [...f, { kind: "chat", id: crypto.randomUUID(), senderName: participant?.name || data.senderName, text: data.text }]);
          } else if (topic === "live-event" && isBattleEvent(data)) {
            void battleRef.current.refresh();
          } else if (topic === "live-event" && data.kind === "gift" && data.competitorId) {
            // A gift to a battle competitor: theirs, not the host's — show it, don't count it.
            battleRef.current.bumpGift(data.competitorId, data.xgAmount);
            setFeed((f) => {
              const { feed: next, count } = appendGift(f, data);
              setGiftMoment({ key: data.giftId, giftType: data.giftType, label: data.label, senderName: data.senderName, count });
              return next;
            });
          } else if (topic === "live-event" && data.kind === "gift") {
            setFeed((f) => {
              const { feed: next, count } = appendGift(f, data);
              setGiftMoment({ key: data.giftId, giftType: data.giftType, label: data.label, senderName: data.senderName, count });
              return next;
            });
            setSupportVersion((v) => v + 1);
            setGiftTotals((t) => ({
              xg: t.xg + (data.xgAmount ?? giftByType(data.giftType)?.xgAmount ?? 0),
              supporterIds: new Set(t.supporterIds).add(data.senderId),
            }));
          } else if (topic === "live-event" && data.kind === "request") {
            setSupportVersion((v) => v + 1);
            setPendingRequests((r) => [
              ...r,
              { id: data.requestId, senderName: data.senderName, message: data.message, xgAmount: data.xgAmount },
            ]);
          } else if (topic === "live-event" && isStageEvent(data)) {
            void refreshStageRef.current();
            if (data.type === "requested") {
              setFeed((f) => [...f, { kind: "system", id: crypto.randomUUID(), text: `${data.displayName ?? "Someone"} asked to join the Live` }]);
            }
          }
        } catch {
          // ignore malformed data messages
        }
      });

      await room.connect(url, token);
      if (cancelled) {
        room.disconnect();
        return;
      }
      // The Live is already running at this point (the session row went LIVE
      // on create) — the clock and header show even if the camera's blocked,
      // same as the mockup's "Camera access is off" state.
      startedAtRef.current ??= Date.now();
      updateViewers();

      let camPub;
      try {
        // Camera + mic in ONE getUserMedia request (one permission prompt).
        // Enabling them one after the other meant two prompts, and on some
        // phones (iOS Safari especially) the second — the microphone —
        // quietly failed, so Lives went out with no audio.
        await room.localParticipant.enableCameraAndMicrophone();
        if (cancelled) {
          room.disconnect();
          return;
        }
        camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
        if (!room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track) {
          // Camera worked but no mic track — try the mic on its own once more.
          await room.localParticipant.setMicrophoneEnabled(true);
        }
      } catch {
        // NotAllowedError (permission denied) or NotFoundError (no device) —
        // distinct from a connection/server error, shown with its own retry
        // affordance (mirrors mobile's "Camera access is off" state).
        if (!cancelled) setStatus("camera-blocked");
        roomRef.current = room;
        setRoom(room);
        return;
      }
      if (cancelled) {
        room.disconnect();
        return;
      }
      if (camPub?.track && videoContainerRef.current) {
        camPub.track.attach(videoContainerRef.current);
      }

      roomRef.current = room;
      setRoom(room);
      setStatus("live");
    }

    connect().catch(() => {
      if (!cancelled) setStatus("error");
    });

    return () => {
      cancelled = true;
      localRoom?.disconnect();
      roomRef.current = null;
      setRoom(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, firebaseUser, retryTick]);

  useEffect(() => {
    if (status !== "live" && status !== "camera-blocked") return;
    const id = setInterval(() => {
      if (startedAtRef.current) setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (!giftMoment) return;
    const key = giftMoment.key;
    const id = setTimeout(() => setGiftMoment((current) => (current?.key === key ? null : current)), GIFT_MOMENT_MS);
    return () => clearTimeout(id);
  }, [giftMoment]);

  async function handleEndLive() {
    setEnding(true);
    try {
      const res = await apiFetch(`/api/live/${params.id}/end`, { method: "POST" });
      const data = await res.json();
      if (res.ok) toast.liveSummary(data.summary);
      else toast.error(data.error ?? "Could not end your Live");
    } finally {
      router.push("/live");
    }
  }

  async function respondToRequest(requestId: string, accept: boolean) {
    setRespondingId(requestId);
    try {
      await apiFetch(`/api/live/${params.id}/requests/${requestId}`, { method: "PATCH", body: JSON.stringify({ accept }) });
    } finally {
      setPendingRequests((r) => r.filter((req) => req.id !== requestId));
      setRespondingId(null);
    }
  }

  async function toggleMic() {
    const next = !micEnabled;
    setMicEnabled(next);
    await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
  }

  // Front/back swap — restartTrack re-acquires the camera with the new
  // facingMode on the same published track, so viewers don't drop.
  async function flipCamera() {
    const next = facingMode === "user" ? "environment" : "user";
    const track = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
    if (!track) return;
    try {
      await track.restartTrack({ facingMode: next });
      setFacingMode(next);
    } catch {
      // No second camera (most desktops) — nothing to flip to.
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
    const room = roomRef.current;
    if (!text || !room) return;
    const mentions = extractMentions(text, mentionCandidates);
    const payload = new TextEncoder().encode(JSON.stringify({ senderName: myName, text, mentions }));
    room.localParticipant.publishData(payload, { topic: "chat", reliable: true });
    setFeed((f) => [...f, { kind: "chat", id: crypto.randomUUID(), senderName: myName, text, mentions, fromHost: true }]);
    emojiUsage.recordFromText(text);
    setChatText("");
  }

  function sendReaction(emoji: string) {
    const r = roomRef.current;
    if (!r || !allowReaction("self")) return;
    r.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ emoji })), { topic: "reaction", reliable: false });
    floating.push(emoji);
    emojiUsage.recordUse([emoji]);
  }

  function formatElapsed(sec: number) {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  if (status === "ended" || status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center gap-4">
        <h1 className="font-serif text-2xl">{status === "ended" ? "This Live has ended" : "Could not start broadcast"}</h1>
        <button onClick={() => router.push("/live")} className="rounded-lg bg-red px-6 py-3 text-sm font-semibold text-white">
          Back to Live
        </button>
      </div>
    );
  }

  const onAir = status === "live" || status === "camera-blocked";
  const supporterCount = support?.supporters.length ?? giftTotals.supporterIds.size;
  const pendingStageRequests = stage?.requests.length ?? 0;

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-gradient-to-b from-[#1f0a0e] via-[#120608] to-black">
      <video
        ref={videoContainerRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full object-cover ${facingMode === "user" ? "-scale-x-100" : ""}`}
      />
      <div ref={audioContainerRef} className="hidden" aria-hidden />
      {onAir && (
        <StageTiles
          room={room}
          hostId={stage?.hostId ?? null}
          people={stage?.onStage ?? []}
          host={{ name: myName, avatarUrl: null }}
          mirrorLocal={facingMode === "user"}
        />
      )}

      {status === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {status === "camera-blocked" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
          <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-red/15 text-red shadow-[0_0_40px_-4px_rgba(225,29,46,0.35)]">
            <CameraOffIcon className="h-9 w-9" />
          </div>
          <p className="font-serif text-[30px] leading-tight text-white">Camera access is off</p>
          <p className="mt-3 text-[15px] leading-relaxed text-white/55">
            Allow camera and microphone for Xoldout in your settings, then try again.
          </p>
          <button
            onClick={() => {
              setStatus("connecting");
              setRetryTick((t) => t + 1);
            }}
            className="mt-6 flex items-center gap-2 rounded-xl bg-white/[0.08] px-6 py-3 text-[16px] text-white transition-colors hover:bg-white/[0.12]"
          >
            <RefreshIcon className="h-[18px] w-[18px]" />
            Try again
          </button>
        </div>
      )}

      {/* Top + bottom scrims so the overlays stay legible over any video. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/55 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-t from-black/90 via-black/50 to-transparent" aria-hidden />

      {giftMoment && <GiftCelebration key={giftMoment.key} moment={giftMoment} />}
      <FloatingReactions items={floating.items} />

      {onAir && (
        <div className="absolute inset-x-0 top-0 px-3 pt-3">
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 items-center gap-2.5 rounded-full bg-black/40 py-1.5 pl-1.5 pr-4 backdrop-blur-sm">
              <InitialsAvatar name={myName} className="h-11 w-11 text-[14px]" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[16px] font-bold text-white">You&apos;re live</span>
                  <span className="flex shrink-0 items-center gap-1 rounded-md bg-red px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
                    Live
                  </span>
                </div>
                <p className="text-[13px] tabular-nums text-white/75">{formatElapsed(elapsed)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPeopleOpen(true);
                void refreshStage();
              }}
              aria-label={`${viewerCount} watching, ${pendingStageRequests} asking to join — see people`}
              className="relative ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[16px] text-white backdrop-blur-sm"
            >
              <EyeIcon className="h-[18px] w-[18px]" />
              {viewerCount.toLocaleString("en-NG")}
              {pendingStageRequests > 0 && (
                <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-red px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                  {pendingStageRequests}
                </span>
              )}
            </button>
            <ShareButton
              title="Live on XOLDOUT"
              text={`${myName} is live on XOLDOUT — join now`}
              path={`/live/${params.id}`}
              label="Share"
              className="bg-red text-white"
            />
          </div>

          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSupportSheet("coins")}
              aria-label="See the coins received in this stream"
              className="flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-[14px] font-semibold text-amber backdrop-blur-sm"
            >
              <XgCoin className="h-4 w-4" />
              {(support?.totalXg ?? giftTotals.xg).toLocaleString("en-NG")} XG
              <span className="text-white/60" aria-hidden>
                ›
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSupportSheet("supporters")}
              aria-label="See who supported you"
              className="flex items-center gap-1 rounded-full bg-black/45 px-3 py-1 text-[14px] font-medium text-white backdrop-blur-sm"
            >
              {supporterCount} supporter{supporterCount === 1 ? "" : "s"}
              <span className="text-white/60" aria-hidden>
                ›
              </span>
            </button>
            {!battleRunning && (
              <button
                type="button"
                onClick={() => void openBattleSetup()}
                className="flex items-center gap-1 rounded-full bg-amber/90 px-3 py-1 text-[14px] font-semibold text-black"
              >
                Battle
              </button>
            )}
          </div>

          {isBattleShown(battle) && (
            <BattleBar
              battle={battle}
              skewMs={battleState.skewMs}
              isHost
              act={battleState.act}
              onDismiss={battleState.dismiss}
              onOpenDetails={() => {
                void battleState.refresh();
                setBattleSheet("details");
              }}
            />
          )}

          {giftMoment && (
            <div className="mt-2.5">
              <GiftBanner key={giftMoment.key} moment={giftMoment} isSelf={false} />
            </div>
          )}
        </div>
      )}

      {onAir && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col pb-[max(env(safe-area-inset-bottom),8px)]">
          {pendingRequests.length > 0 && (
            <div className="mx-3 mb-2 flex max-h-44 flex-col gap-2 overflow-y-auto">
              {pendingRequests.map((r) => (
                <div key={r.id} className="rounded-xl border border-amber/40 bg-black/60 px-3 py-2 backdrop-blur-sm">
                  <p className="mb-1.5 text-[13px] text-white/90">
                    <span className="font-semibold">{r.senderName}</span> · <span className="text-amber">{r.xgAmount} XG request</span>
                    <br />
                    {r.message}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => respondToRequest(r.id, true)}
                      disabled={respondingId === r.id}
                      className="rounded-full bg-red px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => respondToRequest(r.id, false)}
                      disabled={respondingId === r.id}
                      className="rounded-full border border-white/20 px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <LiveFeed items={feed} selfId={null} />

          <MentionSuggestions candidates={mentionMatches} onPick={(c) => setChatText((t) => insertMention(t, c))} />
          <ReactionBar ordered={emojiUsage.ordered} onReact={sendReaction} />

          <div className="flex items-center gap-4 px-3 pt-2">
            <LiveChatInput value={chatText} onChange={setChatText} onSend={sendChat} placeholder="Say something… type @ to tag" />
            <button onClick={toggleMic} aria-label={micEnabled ? "Mute microphone" : "Unmute microphone"} className="shrink-0 p-1 text-white">
              <MicLineIcon className="h-6 w-6" muted={!micEnabled} />
            </button>
            <button onClick={flipCamera} aria-label="Flip camera" className="shrink-0 p-1 text-white">
              <FlipCameraIcon className="h-6 w-6" />
            </button>
          </div>

          <button onClick={handleEndLive} disabled={ending} className="mx-auto mt-3 px-6 py-2 text-[17px] text-white disabled:opacity-50">
            {ending ? "Ending…" : "End live"}
          </button>
        </div>
      )}

      {supportSheet === "supporters" && <SupportersSheet data={support} onClose={() => setSupportSheet(null)} />}
      {supportSheet === "coins" && <CoinStatsSheet data={support} onClose={() => setSupportSheet(null)} />}

      {battleSheet === "setup" && (
        <BattleSetupSheet onStage={stage?.onStage ?? []} balanceXg={hostXg} act={battleState.act} onClose={() => setBattleSheet(null)} />
      )}
      {battleSheet === "details" && battle && <BattleDetailsSheet battle={battle} onClose={() => setBattleSheet(null)} />}

      {peopleOpen && stage && (
        <PeopleSheet liveId={params.id} state={stage} onRefresh={() => void refreshStage()} onClose={() => setPeopleOpen(false)} />
      )}
    </div>
  );
}
