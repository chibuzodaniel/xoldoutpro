"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { InitialsAvatar } from "@/components/live/LiveCard";
import { AddBalance } from "@/components/live/AddBalance";
import { Price } from "@/components/currency/CurrencyProvider";
import { BottomSheet } from "@/components/live/BottomSheet";
import { CloseIcon, EyeIcon, GiftArt, XgCoin, type GiftArtType } from "@/components/live/LiveIcons";
import { GIFT_TYPES } from "@/components/live/giftCatalog";
import { appendGift, GiftBanner, GiftCelebration, LiveFeed, type FeedItem, type GiftMoment } from "@/components/live/LiveFeed";
import { LiveChatInput } from "@/components/live/LiveChatInput";
import { UpcomingLive, type LivePublicInfo } from "@/components/live/UpcomingLive";
import { ShareButton } from "@/components/ui/ShareButton";
import { MicLineIcon } from "@/components/live/LiveIcons";
import { isStageEvent, PeopleSheet, StageTiles, useStageActions, useStageState } from "@/components/live/stage";
import type { ChatMention } from "@/components/live/mentions";
import {
  FloatingReactions,
  LIVE_EMOJIS,
  ReactionBar,
  useEmojiUsage,
  useFloatingReactions,
  useReactionRateLimit,
} from "@/components/live/reactions";
import { unlockGiftSounds } from "@/components/live/giftSound";
import { TopGifterChip, TopGiftersSheet, useTopGifters } from "@/components/live/TopGifters";

function HandIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M8 13V5.5a1.5 1.5 0 013 0V12M11 11.5v-7a1.5 1.5 0 013 0V12M14 6.5a1.5 1.5 0 013 0V14a6 6 0 01-6 6h-.5a6 6 0 01-4.6-2.2L3.6 15a1.6 1.6 0 012.4-2.1L8 15" />
    </svg>
  );
}

function PeopleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14a6 6 0 013.5 6" />
    </svg>
  );
}

type PinnedProduct = { id: string; type: "RELEASE" | "BEAT" | "MERCH"; title: string; priceKobo: number };

type SessionInfo = { title: string; creator: { displayName: string; avatarUrl: string | null }; pinnedProduct: PinnedProduct | null };

function pinnedProductHref(product: PinnedProduct) {
  if (product.type === "BEAT") return `/b/${product.id}`;
  if (product.type === "MERCH") return `/m/${product.id}`;
  return `/r/${product.id}`;
}

// How long the top "X sent Y" banner and the big celebration stay up after
// the most recent gift — matches .animate-gift-banner's 3.2s in globals.css.
const GIFT_MOMENT_MS = 3200;

// Video/chat/gifts for a single Live — web's viewer-only counterpart to the
// mobile broadcast screen (see prisma/schema.prisma's Live section comment
// for why chat/gifts ride LiveKit's own room data channel instead of a
// Postgres table: nothing here needs to survive the session ending).
//
// The <video> below is ALWAYS mounted (never conditionally rendered on
// `status`) — attachTrack attaches directly to it. Earlier the video
// container only rendered once status flipped to "connected", but
// RoomEvent.TrackSubscribed can fire mid-connect (the host's track arrives
// as part of initial room state sync), before that flip — so the ref was
// still null when the attach happened and it silently no-op'd. Keeping the
// element permanently mounted, with connecting/paywall/error states as
// overlays instead of early returns, is what actually fixes that.
function LiveRoom() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  // Each connect() run gets its own guard object and immediately claims
  // this ref as "the active run" — see the long comment on the effect below
  // for why a single shared boolean doesn't work here (StrictMode's dev
  // double-invoke overlaps two runs in time).
  const activeGuardRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  // Room event handlers are registered once per connect; this keeps them on
  // the current toast API without re-running connect.
  // Emoji reactions (explicit ask, 2026-10-04) — components/live/reactions.tsx.
  const emojiUsage = useEmojiUsage();
  const { items: floatingItems, push: pushReaction } = useFloatingReactions();
  const allowReaction = useReactionRateLimit();
  // Gift sounds need one tap on the page before the browser lets them play.
  useEffect(() => unlockGiftSounds(), []);
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [status, setStatus] = useState<"connecting" | "connected" | "needs-payment" | "ended" | "error">("connecting");
  const [priceXg, setPriceXg] = useState<number | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [viewerCount, setViewerCount] = useState(1);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [chatText, setChatText] = useState("");
  const [giftSheetOpen, setGiftSheetOpen] = useState(false);
  const [addBalanceOpen, setAddBalanceOpen] = useState(false);
  const [balanceXg, setBalanceXg] = useState<number | null>(null);
  const [lastSentType, setLastSentType] = useState<GiftArtType | null>(null);
  const [giftMoment, setGiftMoment] = useState<(GiftMoment & { senderId: string }) | null>(null);
  const [requestSheetOpen, setRequestSheetOpen] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestXg, setRequestXg] = useState(10);
  const [requestBusy, setRequestBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  // Co-hosting (explicit ask, 2026-10-04) — see components/live/stage.tsx.
  // The host's video always fills the screen; anyone else on stage
  // (including this viewer, once approved/added) shows as a tile.
  const [room, setRoom] = useState<Room | null>(null);
  // Top gifter chip + leaderboard (explicit ask, 2026-10-04) —
  // components/live/TopGifters.tsx; giftVersion bumps on every gift.
  const [giftVersion, setGiftVersion] = useState(0);
  const [topGiftersOpen, setTopGiftersOpen] = useState(false);
  const topGifters = useTopGifters(params.id, room !== null, giftVersion);
  const hostIdRef = useRef<string | null>(null);
  const selfIdRef = useRef<string | null>(null);
  const { state: stage, refresh: refreshStage } = useStageState(params.id, room !== null);
  const stageActions = useStageActions(params.id, () => void refreshStage());
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [invitedBy, setInvitedBy] = useState<string | null>(null);
  const [stageMicOn, setStageMicOn] = useState(true);
  const meOnStage = !!selfId && (stage?.onStage.some((p) => p.userId === selfId) ?? false);
  const isStaff = stage?.role === "moderator" || stage?.role === "host";

  // Turns this viewer's camera + mic on once the server has granted publish.
  // The permission update and the data message announcing it travel
  // separately, so one short retry covers the message arriving first.
  const goOnStage = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await r.localParticipant.enableCameraAndMicrophone();
        setStageMicOn(true);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
    toast.error("Couldn't turn on your camera or microphone. Check your browser's permissions.");
  }, [toast]);

  const stopPublishing = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    await r.localParticipant.setCameraEnabled(false).catch(() => {});
    await r.localParticipant.setMicrophoneEnabled(false).catch(() => {});
  }, []);

  // Reacts to stage/roles announcements that are about this viewer.
  const onStageEventRef = useRef<(data: { type: string; userId: string; byName?: string; kind: string }) => void>(() => {});
  useEffect(() => {
    onStageEventRef.current = (data) => {
      void refreshStage();
      if (data.userId !== selfIdRef.current) return;
      if (data.kind === "roles") {
        if (data.type === "moderator-added") toast.success("The host made you a moderator of this Live.");
        else if (data.type === "moderator-removed") toast.success("You're no longer a moderator of this Live.");
        return;
      }
      if (data.type === "approved") {
        toast.success("You're on the Live!");
        void goOnStage();
      } else if (data.type === "invited") {
        setInvitedBy(data.byName ?? "The host");
      } else if (data.type === "declined") {
        toast.error("Your request to join wasn't accepted this time.");
      } else if (data.type === "removed") {
        setInvitedBy(null);
        void stopPublishing();
        toast.success("You've been taken off the stage.");
      }
    };
  }, [refreshStage, goOnStage, stopPublishing, toast]);

  // Whether the browser is blocking sound until the viewer interacts
  // (autoplay policy) — shows the "Tap to turn on sound" button.
  const [audioBlocked, setAudioBlocked] = useState(false);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);

  // Video goes into the always-mounted <video>; audio gets its own hidden
  // <audio> element. Audio used to be ignored entirely here (only video
  // was attached), so web viewers watched every Live in silence.
  const attachTrack = useCallback((track: RemoteTrack, identity: string) => {
    if (track.kind === Track.Kind.Video) {
      // Guests on stage render as tiles (StageTiles), never in the host's spot.
      if (hostIdRef.current && identity !== hostIdRef.current) return;
      if (!videoRef.current) return;
      track.attach(videoRef.current);
      setHasVideo(true);
    } else if (track.kind === Track.Kind.Audio) {
      const el = track.attach();
      el.setAttribute("playsinline", "true");
      audioContainerRef.current?.appendChild(el);
    }
  }, []);

  const connect = useCallback(async () => {
    // Claimed immediately (synchronously, before the first await) so a
    // still-pending earlier run's checks below see themselves superseded —
    // see activeGuardRef's own comment.
    const guard = { cancelled: false };
    activeGuardRef.current = guard;

    const res = await apiFetch(`/api/live/${params.id}/join`);
    if (guard.cancelled) return;
    if (res.status === 402) {
      const data = await res.json();
      if (guard.cancelled) return;
      setPriceXg(data.priceXg ?? null);
      setStatus("needs-payment");
      return;
    }
    if (!res.ok) {
      setStatus(res.status === 404 ? "ended" : "error");
      return;
    }
    const { token, url, viewerId, hostId, session: sessionInfo } = await res.json();
    if (guard.cancelled) return;
    setSession(sessionInfo ?? null);
    setSelfId(viewerId ?? null);
    selfIdRef.current = viewerId ?? null;
    hostIdRef.current = hostId ?? null;

    const room = new Room();

    room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => attachTrack(track, participant.identity));
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) track.detach().forEach((el) => el.remove());
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio));
    room.on(RoomEvent.ParticipantConnected, () => setViewerCount(room.remoteParticipants.size + 1));
    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      setViewerCount(room.remoteParticipants.size + 1);
      if (participant.permissions?.canPublish) void onStageEventRef.current({ kind: "stage", type: "left-room", userId: participant.identity });
    });
    room.on(RoomEvent.Disconnected, () => setStatus("ended"));
    room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
      const text = new TextDecoder().decode(payload);
      try {
        const data = JSON.parse(text);
        if (topic === "reaction") {
          if (participant && allowReaction(participant.identity) && (LIVE_EMOJIS as readonly string[]).includes(data.emoji)) {
            pushReaction(data.emoji);
          }
        } else if (topic === "chat") {
          // @-mentions only count from the host's own connection.
          const fromHost = !!participant && participant.identity === hostIdRef.current;
          const mentions: ChatMention[] | undefined = fromHost && Array.isArray(data.mentions) ? data.mentions : undefined;
          const mentionsMe = !!mentions?.some((m) => m.userId === selfIdRef.current);
          setFeed((f) => [
            ...f,
            { kind: "chat", id: crypto.randomUUID(), senderName: data.senderName, text: data.text, mentions, fromHost, mentionsMe },
          ]);
          if (mentionsMe) toastRef.current.success(`${data.senderName} mentioned you`);
        } else if (topic === "live-event" && data.kind === "gift") {
          setGiftVersion((v) => v + 1);
          setFeed((f) => {
            const { feed: next, count } = appendGift(f, data);
            setGiftMoment({
              key: data.giftId,
              giftType: data.giftType,
              label: data.label,
              senderName: data.senderName,
              senderId: data.senderId,
              count,
            });
            return next;
          });
        } else if (topic === "live-event" && data.kind === "request") {
          setFeed((f) => [
            ...f,
            { kind: "request", id: data.requestId, senderName: data.senderName, message: data.message, xgAmount: data.xgAmount },
          ]);
        } else if (topic === "live-event" && isStageEvent(data)) {
          onStageEventRef.current(data);
        }
      } catch {
        // ignore malformed data messages
      }
    });

    await room.connect(url, token);
    if (guard.cancelled) {
      room.disconnect();
      return;
    }
    roomRef.current = room;
    setRoom(room);
    setViewerCount(room.remoteParticipants.size + 1);
    setAudioBlocked(!room.canPlaybackAudio);
    setStatus("connected");
  }, [params.id, attachTrack, allowReaction, pushReaction]);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.push(`/login?next=/live/${params.id}`);
      return;
    }
    // React StrictMode double-invokes this effect in dev (mount → cleanup →
    // mount again), and `connect` is async fire-and-forget — without the
    // activeGuardRef check above, the first invocation's in-flight
    // room.connect() kept running after cleanup, racing a second room for
    // the same identity ("could not createOffer with closed peer
    // connection" / "skipping incoming track after Room disconnected").
    // The same discipline matters in production too, for a viewer who
    // navigates away mid-connect.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time connect on mount, not derived render state
    connect();
    return () => {
      activeGuardRef.current.cancelled = true;
      roomRef.current?.disconnect();
      roomRef.current = null;
      setRoom(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, firebaseUser]);

  useEffect(() => {
    if (!giftMoment) return;
    const key = giftMoment.key;
    const id = setTimeout(() => setGiftMoment((current) => (current?.key === key ? null : current)), GIFT_MOMENT_MS);
    return () => clearTimeout(id);
  }, [giftMoment]);

  useEffect(() => {
    if (!giftSheetOpen) return;
    apiFetch("/api/coins")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setBalanceXg(data.balanceXg));
  }, [giftSheetOpen]);

  async function handleBuyAccess() {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/live/${params.id}/access`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.insufficientXg) {
          setAddBalanceOpen(true);
          return;
        }
        throw new Error(data.error ?? "Could not buy access");
      }
      setStatus("connecting");
      await connect();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function sendChat() {
    const text = chatText.trim();
    const room = roomRef.current;
    if (!text || !room) return;
    const senderName = firebaseUser?.displayName ?? "You";
    const payload = new TextEncoder().encode(JSON.stringify({ senderName, text }));
    room.localParticipant.publishData(payload, { topic: "chat", reliable: true });
    setFeed((f) => [...f, { kind: "chat", id: crypto.randomUUID(), senderName: "You", text }]);
    emojiUsage.recordFromText(text);
    setChatText("");
  }

  function sendReaction(emoji: string) {
    const room = roomRef.current;
    if (!room || !allowReaction("self")) return;
    room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ emoji })), { topic: "reaction", reliable: false });
    pushReaction(emoji);
    emojiUsage.recordUse([emoji]);
  }

  // Tapping a gift sends it straight away and keeps the sheet open, so
  // repeated taps stack into the mockup's "×N" combo.
  async function sendGift(giftType: GiftArtType) {
    setLastSentType(giftType);
    const xgAmount = GIFT_TYPES.find((g) => g.type === giftType)?.xgAmount ?? 0;
    setBalanceXg((b) => (b === null ? b : b - xgAmount));
    try {
      const res = await apiFetch(`/api/live/${params.id}/gifts`, { method: "POST", body: JSON.stringify({ giftType }) });
      const data = await res.json();
      if (!res.ok) {
        setBalanceXg((b) => (b === null ? b : b + xgAmount));
        if (data.insufficientXg) {
          setAddBalanceOpen(true);
          return;
        }
        throw new Error(data.error ?? "Could not send gift");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function sendRequest() {
    const message = requestMessage.trim();
    if (!message) return;
    setRequestBusy(true);
    try {
      const res = await apiFetch(`/api/live/${params.id}/requests`, {
        method: "POST",
        body: JSON.stringify({ message, xgAmount: requestXg }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.insufficientXg) {
          setAddBalanceOpen(true);
          return;
        }
        throw new Error(data.error ?? "Could not send request");
      }
      setRequestSheetOpen(false);
      setRequestMessage("");
      setRequestXg(10);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRequestBusy(false);
    }
  }

  async function toggleStageMic() {
    const next = !stageMicOn;
    setStageMicOn(next);
    await roomRef.current?.localParticipant.setMicrophoneEnabled(next).catch(() => {});
  }

  async function leaveStage() {
    setInvitedBy(null);
    await stopPublishing();
    await stageActions.self("leave", "You've left the stage.");
  }

  const addBalanceSheet = addBalanceOpen && (
    <BottomSheet onClose={() => setAddBalanceOpen(false)} z="z-[60]">
      <AddBalance />
    </BottomSheet>
  );

  if (status === "needs-payment") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center gap-4">
        <h1 className="font-serif text-2xl">This Live is paid</h1>
        <p className="text-sm text-ink-3">Join for {priceXg} XG.</p>
        <button onClick={handleBuyAccess} disabled={busy} className="rounded-lg bg-red px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Joining…" : `Join · ${priceXg} XG`}
        </button>
        {addBalanceSheet}
      </div>
    );
  }

  if (status === "ended" || status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center gap-4">
        <h1 className="font-serif text-2xl">{status === "ended" ? "This Live has ended" : "Could not connect"}</h1>
        <button onClick={() => router.push("/live")} className="rounded-lg bg-red px-6 py-3 text-sm font-semibold text-white">
          Back to Live
        </button>
      </div>
    );
  }

  const creatorName = session?.creator.displayName ?? "";

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-gradient-to-b from-[#3a1460] via-[#2a0f45] to-[#0d0614]">
      <video ref={videoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
      {/* Remote audio elements (attachTrack) live here, never visible. */}
      <div ref={audioContainerRef} className="hidden" aria-hidden />
      {status === "connected" && (
        <StageTiles
          room={room}
          hostId={stage?.hostId ?? null}
          people={stage?.onStage ?? []}
          host={{ name: session?.creator.displayName ?? "Host", avatarUrl: session?.creator.avatarUrl ?? null }}
        />
      )}

      {status === "connected" && audioBlocked && (
        <button
          type="button"
          onClick={() => {
            void roomRef.current?.startAudio().then(() => setAudioBlocked(!roomRef.current?.canPlaybackAudio));
          }}
          className="absolute left-1/2 top-24 z-30 -translate-x-1/2 flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[15px] font-semibold text-black shadow-lg"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
            <path d="M11 5L6 9H3v6h3l5 4V5z" />
            <path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />
          </svg>
          Tap to turn on sound
        </button>
      )}

      {status === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {/* No video track yet: the mockup's stand-in — the creator's avatar
          large in the middle with a soft "listening" waveform underneath. */}
      {status === "connected" && !hasVideo && session && (stage?.onStage.length ?? 0) === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
          <div className="absolute h-72 w-72 rounded-full bg-[#7a3ac0]/25 blur-3xl" aria-hidden />
          <FallbackImg
            src={session.creator.avatarUrl}
            alt={creatorName}
            className="relative h-36 w-36 rounded-full object-cover border-2 border-white/20"
            fallback={<InitialsAvatar name={creatorName} className="relative h-36 w-36 text-5xl border-2" />}
          />
          <div className="relative flex h-10 items-end gap-1.5" aria-hidden>
            {[0.9, 0.5, 0.75, 0.35, 0.6, 0.4, 0.8].map((h, i) => (
              <span
                key={i}
                className="w-1.5 origin-bottom rounded-full bg-white/50 animate-waveform-bar"
                style={{ height: `${h * 100}%`, animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Top + bottom scrims so the overlays stay legible over any video. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/55 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/85 via-black/45 to-transparent" aria-hidden />

      {giftMoment && <GiftCelebration key={giftMoment.key} moment={giftMoment} />}
      <FloatingReactions items={floatingItems} />

      {status === "connected" && (
        <div className="absolute inset-x-0 top-0 px-3 pt-3">
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 items-center gap-2.5 rounded-full bg-black/40 py-1.5 pl-1.5 pr-4 backdrop-blur-sm">
              <FallbackImg
                src={session?.creator.avatarUrl ?? null}
                alt={creatorName}
                className="h-11 w-11 shrink-0 rounded-full object-cover border border-white/25"
                fallback={<InitialsAvatar name={creatorName || "?"} className="h-11 w-11 text-[14px]" />}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[16px] font-bold text-white">{creatorName}</span>
                  <span className="flex shrink-0 items-center gap-1 rounded-md bg-red px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
                    Live
                  </span>
                </div>
                {session?.title && <p className="truncate text-[13px] text-white/75">{session.title}</p>}
              </div>
            </div>
            <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[16px] text-white">
              <EyeIcon className="h-[18px] w-[18px]" />
              {viewerCount.toLocaleString("en-NG")}
            </span>
            {isStaff && (
              <button
                type="button"
                onClick={() => {
                  setPeopleOpen(true);
                  void refreshStage();
                }}
                aria-label="People and requests to join"
                className="relative shrink-0 rounded-full bg-white/15 p-1.5 text-white backdrop-blur-sm"
              >
                <PeopleIcon className="h-5 w-5" />
                {(stage?.requests.length ?? 0) > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-red px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                    {stage?.requests.length}
                  </span>
                )}
              </button>
            )}
            <ShareButton
              title={session?.title ?? "Live on XOLDOUT"}
              text={`${creatorName} is live on XOLDOUT — join now`}
              path={`/live/${params.id}`}
              label="Share"
              className="bg-white/15 text-white backdrop-blur-sm"
            />
            <button onClick={() => router.push("/live")} aria-label="Leave Live" className="shrink-0 p-1 text-white">
              <CloseIcon className="h-6 w-6" />
            </button>
          </div>

          {topGifters.length > 0 && (
            <div className="mt-2.5">
              <TopGifterChip top={topGifters[0]} selfId={selfId} onOpen={() => setTopGiftersOpen(true)} />
            </div>
          )}

          {giftMoment && (
            <div className="mt-4">
              <GiftBanner key={giftMoment.key} moment={giftMoment} isSelf={giftMoment.senderId === selfId} />
            </div>
          )}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex flex-col pb-[max(env(safe-area-inset-bottom),12px)]">
        {status === "connected" && session?.pinnedProduct && (
          <Link
            href={pinnedProductHref(session.pinnedProduct)}
            className="mx-3 mb-2 flex items-center justify-between rounded-xl bg-black/55 px-3 py-2.5 backdrop-blur-sm"
          >
            <span className="truncate text-[13px] text-white">🛍 {session.pinnedProduct.title}</span>
            <span className="ml-2 shrink-0 rounded-full bg-red px-2.5 py-1 text-[11px] font-semibold text-white">
              <Price kobo={session.pinnedProduct.priceKobo} freeLabel="Free" />
            </span>
          </Link>
        )}

        <LiveFeed items={feed} selfId={selfId} />

        {status === "connected" && meOnStage && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-full bg-black/55 py-1.5 pl-3 pr-1.5 backdrop-blur-sm">
            <span className="h-2 w-2 shrink-0 rounded-full bg-red" aria-hidden />
            <span className="flex-1 text-[13px] font-semibold text-white">You&apos;re on the Live</span>
            <button
              type="button"
              onClick={toggleStageMic}
              aria-label={stageMicOn ? "Mute your microphone" : "Unmute your microphone"}
              className="rounded-full bg-white/10 p-1.5 text-white"
            >
              <MicLineIcon className="h-5 w-5" muted={!stageMicOn} />
            </button>
            <button type="button" onClick={leaveStage} className="rounded-full bg-red px-3 py-1.5 text-[12px] font-semibold text-white">
              Leave stage
            </button>
          </div>
        )}

        {status === "connected" && <ReactionBar ordered={emojiUsage.ordered} onReact={sendReaction} />}

        <div className="flex items-center gap-3 px-3 pt-2">
          <LiveChatInput value={chatText} onChange={setChatText} onSend={sendChat} />
          {status === "connected" && stage && !meOnStage && stage.role !== "host" && (
            <button
              type="button"
              disabled={stageActions.busyKey !== null}
              onClick={() =>
                stage.myRequestStatus === "PENDING"
                  ? stageActions.self("cancel", "Request cancelled.")
                  : stageActions.self("request", "Request sent — the host or a moderator will let you in.")
              }
              aria-label={stage.myRequestStatus === "PENDING" ? "Cancel your request to join" : "Request to join the Live"}
              className={`flex shrink-0 items-center gap-1.5 rounded-full py-2 pl-2.5 pr-3 text-[14px] font-medium text-white disabled:opacity-50 ${
                stage.myRequestStatus === "PENDING" ? "border border-amber/60 bg-amber/15" : "border border-white/25 bg-black/60"
              }`}
            >
              <HandIcon className="h-5 w-5" />
              {stage.myRequestStatus === "PENDING" ? "Requested" : "Join"}
            </button>
          )}
          <button
            onClick={() => setGiftSheetOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border-2 border-red/70 bg-black/70 py-2 pl-3 pr-4 text-[16px] font-medium text-white shadow-[0_0_16px_-2px_rgba(225,29,46,0.55)]"
          >
            <GiftArt type="GRAMMY" className="h-6 w-6" />
            Gift
          </button>
        </div>
      </div>

      {giftSheetOpen && (
        <BottomSheet onClose={() => setGiftSheetOpen(false)}>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-serif text-[28px] leading-tight">Send a gift</h2>
            <button onClick={() => setAddBalanceOpen(true)} className="flex items-center gap-1.5 text-[17px] font-semibold text-amber">
              <XgCoin className="h-5 w-5" />
              {balanceXg === null ? "…" : balanceXg.toLocaleString("en-NG")} XG
              <span className="ml-1 text-xl font-normal leading-none">+</span>
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {GIFT_TYPES.map((g) => {
              const selected = lastSentType === g.type;
              return (
                <button
                  key={g.type}
                  onClick={() => sendGift(g.type)}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border py-4 transition-colors ${
                    selected ? "border-red/60 bg-red/15" : "border-transparent hover:bg-white/[0.04]"
                  }`}
                >
                  <GiftArt type={g.type} className="h-11 w-11" />
                  <span className="text-[14px] font-semibold text-ink-2">{g.label}</span>
                  <span className="text-[13px] text-amber">{g.xgAmount} XG</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => {
              setGiftSheetOpen(false);
              setRequestSheetOpen(true);
            }}
            className="mt-4 w-full text-center text-[13px] text-ink-3 hover:text-ink-2"
          >
            Send a paid request instead ›
          </button>
        </BottomSheet>
      )}

      {requestSheetOpen && (
        <BottomSheet onClose={() => setRequestSheetOpen(false)}>
          <h2 className="font-serif text-[24px] leading-tight mb-1">Send a request</h2>
          <p className="text-xs text-ink-3 mb-4">Paid, to get the creator&apos;s attention — a song to play, a question to answer, anything.</p>
          <textarea
            value={requestMessage}
            onChange={(e) => setRequestMessage(e.target.value)}
            rows={3}
            placeholder="What's your request?"
            maxLength={500}
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red resize-none mb-3"
          />
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-ink-3">XG:</span>
            <button
              type="button"
              onClick={() => setRequestXg((v) => Math.max(10, v - 10))}
              className="h-8 w-8 rounded-lg border border-line text-ink-2"
            >
              −
            </button>
            <span className="w-12 text-center text-sm font-semibold text-amber">{requestXg}</span>
            <button type="button" onClick={() => setRequestXg((v) => v + 10)} className="h-8 w-8 rounded-lg border border-line text-ink-2">
              +
            </button>
          </div>
          <button
            onClick={sendRequest}
            disabled={requestBusy || !requestMessage.trim()}
            className="w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {requestBusy ? "Sending…" : `Send · ${requestXg} XG`}
          </button>
        </BottomSheet>
      )}

      {topGiftersOpen && <TopGiftersSheet gifters={topGifters} selfId={selfId} onClose={() => setTopGiftersOpen(false)} />}

      {peopleOpen && stage && isStaff && (
        <PeopleSheet liveId={params.id} state={stage} onRefresh={() => void refreshStage()} onClose={() => setPeopleOpen(false)} />
      )}

      {invitedBy && meOnStage && (
        <BottomSheet onClose={() => undefined}>
          <h2 className="mb-1 font-serif text-[24px] leading-tight">You&apos;ve been added to the Live</h2>
          <p className="mb-5 text-sm text-ink-3">{invitedBy} brought you on stage. Everyone watching will see and hear you.</p>
          <button
            type="button"
            onClick={() => {
              setInvitedBy(null);
              void goOnStage();
            }}
            className="mb-2 w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white"
          >
            Turn on camera &amp; mic
          </button>
          <button type="button" onClick={leaveStage} className="w-full rounded-lg border border-line py-3 text-sm font-semibold text-ink-2">
            Not now
          </button>
        </BottomSheet>
      )}

      {addBalanceSheet}
    </div>
  );
}

// How often a waiting page re-checks whether a scheduled Live has started.
const SCHEDULED_POLL_MS = 15_000;

/**
 * Entry point for any /live/[id] link — including shared ones (explicit ask:
 * hosts share the link so people can join, and can schedule a Live and
 * share its link ahead of time). Loads the Live's public info first, then:
 * scheduled → countdown / Remind me / Share (UpcomingLive), switching to the
 * room by itself the moment the host starts; ended → ended screen; live →
 * the room. Works signed out up to the point of actually joining.
 */
export default function LiveViewerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { loading: authLoading, firebaseUser } = useAuth();
  const [live, setLive] = useState<LivePublicInfo | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    async function load() {
      const res = await apiFetch(`/api/live/${params.id}`);
      if (cancelled) return;
      if (!res.ok) return setState("missing");
      const data: { live: LivePublicInfo } = await res.json();
      if (cancelled) return;
      setLive(data.live);
      setState("ready");
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, firebaseUser, params.id]);

  // While it's still scheduled, keep checking — everyone waiting on the link
  // drops straight into the room once the host starts.
  useEffect(() => {
    if (live?.status !== "SCHEDULED") return;
    const id = setInterval(async () => {
      const res = await apiFetch(`/api/live/${params.id}`);
      if (!res.ok) return;
      const data: { live: LivePublicInfo } = await res.json();
      if (data.live.status !== "SCHEDULED") setLive(data.live);
    }, SCHEDULED_POLL_MS);
    return () => clearInterval(id);
  }, [live?.status, params.id]);

  if (state === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (state === "missing" || !live || live.status === "ENDED") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center gap-4">
        <h1 className="font-serif text-2xl">{state === "missing" ? "Live not found" : "This Live has ended"}</h1>
        <button onClick={() => router.push("/live")} className="rounded-lg bg-red px-6 py-3 text-sm font-semibold text-white">
          See who&apos;s live
        </button>
      </div>
    );
  }

  if (live.status === "SCHEDULED") return <UpcomingLive live={live} onChange={setLive} />;

  return <LiveRoom />;
}
