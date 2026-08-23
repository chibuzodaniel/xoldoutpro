"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getOfflinePlaybackUrl } from "@/lib/offline/downloads";

export type PlayableTrack = {
  trackId: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  lyricsText: string | null;
  // "track" (default, omit for Release call sites) fetches /api/tracks/[id]/audio-url
  // and checks the offline cache; "beat" fetches /api/beats/[id]/audio-url and skips
  // offline lookup (beats have no offline cache format — DECISIONS.md).
  kind?: "track" | "beat";
  // The sellable Product this track belongs to — for "track" this is the
  // parent Release's id (trackId is the individual Track's own id, a
  // different record), for "beat" it's the same as trackId. Needed so the
  // player's Share button can link to the actual product page instead of
  // just sharing the title/artist as plain text.
  productId?: string;
};

type RepeatMode = "off" | "all" | "one";

type PlayerState = {
  current: PlayableTrack | null;
  isPlaying: boolean;
  positionSec: number;
  durationSec: number;
  repeatMode: RepeatMode;
  expanded: boolean;
  entitled: boolean;
  previewStartSec: number | null;
  previewEndSec: number | null;
  loading: boolean;
  queue: PlayableTrack[];
  queueIndex: number;
  volume: number;
  remoteSupported: boolean;
  // `queue` is optional — call sites playing a single track (a beat, a
  // standalone preview) can omit it and next/previous simply won't have
  // anywhere to go; Release playback passes the full tracklist so skip
  // controls have real siblings to move through.
  play: (track: PlayableTrack, queue?: PlayableTrack[]) => void;
  togglePlay: () => void;
  seek: (sec: number) => void;
  cycleRepeat: () => void;
  setExpanded: (v: boolean) => void;
  next: () => void;
  previous: () => void;
  setVolume: (v: number) => void;
  requestRemotePlayback: () => void;
};

const PlayerContext = createContext<PlayerState | null>(null);

// A single persistent <audio> element, held by a provider mounted at the
// app root — playback (and the mini player showing it) survives navigation
// to any route, not just an authenticated app-shell subset (PRD §9).
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<PlayableTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [expanded, setExpanded] = useState(false);
  const [entitled, setEntitled] = useState(true);
  const [previewStartSec, setPreviewStartSec] = useState<number | null>(null);
  const [previewEndSec, setPreviewEndSec] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<PlayableTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [remoteSupported, setRemoteSupported] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection can't run during SSR; must happen post-mount
    setRemoteSupported(typeof HTMLMediaElement !== "undefined" && "remote" in HTMLMediaElement.prototype);
  }, []);

  // Read inside the (stable, registered-once) audio event listeners without
  // stale closures — these mirror the state above on every change.
  const guardRef = useRef({ entitled, previewStartSec, previewEndSec, repeatMode, queue, queueIndex });
  useEffect(() => {
    guardRef.current = { entitled, previewStartSec, previewEndSec, repeatMode, queue, queueIndex };
  }, [entitled, previewStartSec, previewEndSec, repeatMode, queue, queueIndex]);

  const objectUrlRef = useRef<string | null>(null);

  const play = useCallback(async (track: PlayableTrack, queueArg?: PlayableTrack[]) => {
    const q = queueArg && queueArg.length > 0 ? queueArg : [track];
    const idx = q.findIndex((t) => t.trackId === track.trackId);
    setQueue(q);
    setQueueIndex(idx === -1 ? 0 : idx);
    setCurrent(track);
    setLoading(true);
    setIsPlaying(false);
    try {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      const audio = audioRef.current!;
      const kind = track.kind ?? "track";

      // Downloaded tracks play from the local encrypted cache with no
      // network round-trip at all — this is what makes offline playback
      // (PRD §9) actually work, not just "the button exists". Beats have no
      // offline cache format yet, so this lookup is skipped for them.
      const offlineUrl = kind === "track" ? await getOfflinePlaybackUrl(track.trackId) : null;
      if (offlineUrl) {
        objectUrlRef.current = offlineUrl;
        setEntitled(true);
        setPreviewStartSec(null);
        setPreviewEndSec(null);
        audio.src = offlineUrl;
        audio.currentTime = 0;
        await audio.play();
        setIsPlaying(true);
        return;
      }

      const res = await apiFetch(kind === "beat" ? `/api/beats/${track.trackId}/audio-url` : `/api/tracks/${track.trackId}/audio-url`);
      if (!res.ok) throw new Error("Could not load track");
      const data = await res.json();
      setEntitled(data.entitled);
      setPreviewStartSec(data.previewStartSec);
      setPreviewEndSec(data.previewEndSec);

      audio.src = data.url;
      audio.currentTime = data.entitled ? 0 : data.previewStartSec ?? 0;
      await audio.play();
      setIsPlaying(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  }, [play]);

  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    audioRef.current = audio;

    const onTime = () => {
      setPositionSec(audio.currentTime);
      const { entitled: ent, previewStartSec: start, previewEndSec: end } = guardRef.current;
      if (!ent && start !== null && end !== null && audio.currentTime >= end) {
        audio.currentTime = start;
        audio.pause();
        setIsPlaying(false);
      }
      // Drives the scrub bar on the lock-screen/OS media controls — reads
      // straight off the audio element rather than React state, so it's
      // fine inside this once-registered, empty-deps listener.
      if ("mediaSession" in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: Math.min(audio.currentTime, audio.duration),
          });
        } catch {
          // Some browsers throw if position/duration are momentarily out of
          // sync (e.g. right after a seek) — cosmetic, safe to ignore.
        }
      }
    };
    const onLoaded = () => setDurationSec(audio.duration || 0);
    const onEnded = () => {
      const { repeatMode: mode, queue: q, queueIndex: idx } = guardRef.current;
      if (mode === "one") {
        audio.currentTime = 0;
        audio.play();
        return;
      }
      if (idx < q.length - 1) {
        playRef.current(q[idx + 1], q);
        return;
      }
      if (mode === "all" && q.length > 0) {
        playRef.current(q[0], q);
        return;
      }
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one persistent <audio> element for the app's lifetime; volume applied here is just the initial value, live changes go through setVolume
  }, []);

  // Drives the OS-level "now playing" surface (lock screen, notification
  // shade, headset controls) — title/artwork straight from the current
  // track, with a fixed "album" line as the app watermark (lock screens
  // typically render title/artist/album as the visible hierarchy, so this
  // is the one field that reliably shows "Playing on XOLDOUT" everywhere).
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!current) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artistName,
      album: "Playing on XOLDOUT",
      artwork: current.artworkUrl
        ? [96, 256, 512].map((size) => ({ src: current.artworkUrl!, sizes: `${size}x${size}` }))
        : [],
    });
  }, [current]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  }, [isPlaying, current]);

  const seek = useCallback(
    (sec: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      let clamped = sec;
      if (!entitled && previewStartSec !== null && previewEndSec !== null) {
        clamped = Math.min(Math.max(sec, previewStartSec), previewEndSec);
      }
      audio.currentTime = clamped;
      setPositionSec(clamped);
    },
    [entitled, previewStartSec, previewEndSec],
  );

  const cycleRepeat = useCallback(() => {
    setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"));
  }, []);

  // Skip to the next track in the current queue — a no-op past the end.
  const next = useCallback(() => {
    if (queueIndex < queue.length - 1) play(queue[queueIndex + 1], queue);
  }, [queue, queueIndex, play]);

  // Mirrors the near-universal "tap back = restart this track, tap back
  // again quickly = go to the previous one" convention (Spotify, Apple
  // Music, etc.) rather than always jumping tracks.
  const previous = useCallback(() => {
    if (positionSec > 3 || queueIndex === 0) {
      seek(0);
    } else {
      play(queue[queueIndex - 1], queue);
    }
  }, [queue, queueIndex, positionSec, seek, play]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    if (audioRef.current) audioRef.current.volume = clamped;
    setVolumeState(clamped);
  }, []);

  // Makes the lock-screen/notification transport controls actually do
  // something, not just display — same handlers the in-app player buttons
  // call. Re-registered whenever these identities change (isPlaying/queue
  // position shift them), which is cheap — just reassigning a few handlers.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", togglePlay);
    navigator.mediaSession.setActionHandler("pause", togglePlay);
    navigator.mediaSession.setActionHandler("previoustrack", previous);
    navigator.mediaSession.setActionHandler("nexttrack", next);
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) seek(details.seekTime);
    });
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("seekto", null);
    };
  }, [togglePlay, previous, next, seek]);

  // Remote Playback API — native browser picker for AirPlay/cast-capable
  // devices on the current <audio> element. No SDK, no extra dependency;
  // silently unavailable (remoteSupported is false) on browsers that don't
  // implement it, so the UI can just hide the control there.
  const requestRemotePlayback = useCallback(() => {
    const remote = (audioRef.current as HTMLMediaElement & { remote?: { prompt: () => Promise<void> } })?.remote;
    remote?.prompt().catch(() => {});
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        current,
        isPlaying,
        positionSec,
        durationSec,
        repeatMode,
        expanded,
        entitled,
        previewStartSec,
        previewEndSec,
        loading,
        queue,
        queueIndex,
        volume,
        remoteSupported,
        play,
        togglePlay,
        seek,
        cycleRepeat,
        setExpanded,
        next,
        previous,
        setVolume,
        requestRemotePlayback,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
