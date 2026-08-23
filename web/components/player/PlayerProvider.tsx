"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getOfflinePlaybackUrl, listDownloads } from "@/lib/offline/downloads";

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
  shuffled: boolean;
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
  toggleShuffle: () => void;
  setExpanded: (v: boolean) => void;
  next: () => void;
  previous: () => void;
  setVolume: (v: number) => void;
  requestRemotePlayback: () => void;
};

const PlayerContext = createContext<PlayerState | null>(null);

// Registers a Media Session action handler defensively — some actions
// (e.g. "stop") aren't implemented by every browser, and calling
// setActionHandler for one throws there rather than no-oping. Progressive
// enhancement: never let an unsupported action break the rest.
function safeSetActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // Not supported by this browser/platform — safe to ignore.
  }
}

// A single persistent <audio> element, held by a provider mounted at the
// app root — playback (and the mini player showing it) survives navigation
// to any route, not just an authenticated app-shell subset (PRD §9). This
// is the app's one and only audio engine; every play entry point (in-app
// buttons, the lock screen, headset controls) goes through the play/
// togglePlay/next/previous functions this provider exposes — none of them
// duplicate playback logic of their own.
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<PlayableTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [shuffled, setShuffled] = useState(false);
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
  const guardRef = useRef({ current, entitled, previewStartSec, previewEndSec, repeatMode, queue, queueIndex });
  useEffect(() => {
    guardRef.current = { current, entitled, previewStartSec, previewEndSec, repeatMode, queue, queueIndex };
  }, [current, entitled, previewStartSec, previewEndSec, repeatMode, queue, queueIndex]);

  const objectUrlRef = useRef<string | null>(null);

  // /api/tracks/[id]/audio-url signs its R2 URL for only 300s. Resuming via
  // a bare audio.play() after that window (e.g. pressing play again once a
  // track has fully ended and playback stopped) hits an expired URL: the
  // browser fires an 'error' event rather than actually playing anything.
  // Set whenever playback stops with the loaded URL known to be stale;
  // togglePlay checks it and re-fetches through play() instead of resuming
  // in place. This is a fast-path optimization, not the only line of
  // defense — the 'error' listener below catches every other staleness
  // case (e.g. resuming after a long mid-track pause) generically. play()
  // always clears it since it always fetches (or re-decrypts, for offline)
  // a fresh source.
  const needsFreshUrlRef = useRef(false);

  // Incrementing token so overlapping play() calls (double-tapping Next,
  // the lock screen and an in-app tap landing at nearly the same time,
  // etc.) can't race — a call whose token has been superseded by a newer
  // one bails out after each await instead of mutating state out of order.
  const playTokenRef = useRef(0);

  const play = useCallback(async (track: PlayableTrack, queueArg?: PlayableTrack[]) => {
    const myToken = ++playTokenRef.current;
    const q = queueArg && queueArg.length > 0 ? queueArg : [track];
    const idx = q.findIndex((t) => t.trackId === track.trackId);
    needsFreshUrlRef.current = false;
    setQueue(q);
    setQueueIndex(idx === -1 ? 0 : idx);
    setCurrent(track);
    setLoading(true);
    try {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      const audio = audioRef.current;
      if (!audio) return;
      const kind = track.kind ?? "track";

      // Downloaded tracks play from the local encrypted cache with no
      // network round-trip at all — this is what makes offline playback
      // (PRD §9) actually work, not just "the button exists". Beats have no
      // offline cache format yet, so this lookup is skipped for them.
      const offlineUrl = kind === "track" ? await getOfflinePlaybackUrl(track.trackId) : null;
      if (myToken !== playTokenRef.current) return; // superseded by a newer play() while awaiting the offline lookup

      if (offlineUrl) {
        objectUrlRef.current = offlineUrl;
        setEntitled(true);
        setPreviewStartSec(null);
        setPreviewEndSec(null);
        audio.src = offlineUrl;
        audio.currentTime = 0;
        await audio.play();
        // isPlaying is set by the 'playing' event listener once playback is
        // genuinely confirmed, not assumed here just because play() didn't throw.
        return;
      }

      const res = await apiFetch(kind === "beat" ? `/api/beats/${track.trackId}/audio-url` : `/api/tracks/${track.trackId}/audio-url`);
      if (myToken !== playTokenRef.current) return;
      if (!res.ok) throw new Error("Could not load track");
      const data = await res.json();
      if (myToken !== playTokenRef.current) return;
      setEntitled(data.entitled);
      setPreviewStartSec(data.previewStartSec);
      setPreviewEndSec(data.previewEndSec);

      audio.src = data.url;
      audio.currentTime = data.entitled ? 0 : data.previewStartSec ?? 0;
      await audio.play();
    } catch (err) {
      console.error("[player] play() failed", err);
      if (myToken === playTokenRef.current) setIsPlaying(false);
    } finally {
      if (myToken === playTokenRef.current) setLoading(false);
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
        audio.pause(); // the 'pause' listener below flips isPlaying to false
      }
      // Drives the scrub bar on the lock-screen/OS media controls — reads
      // straight off the audio element rather than React state, so it's
      // fine inside this once-registered, empty-deps listener.
      if ("mediaSession" in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: Math.min(Math.max(audio.currentTime, 0), audio.duration),
          });
        } catch {
          // Some browsers throw if position/duration are momentarily out of
          // sync (e.g. right after a seek) — cosmetic, safe to ignore.
        }
      }
    };
    const onLoaded = () => setDurationSec(audio.duration || 0);

    // Single source of truth for isPlaying: derived from the audio
    // element's own events, not from callers assuming a play()/pause()
    // call succeeded. Nothing else in this file sets isPlaying directly
    // outside of these listeners and play()/togglePlay()'s failure paths.
    const onPlaying = () => setIsPlaying(true);
    const onPauseEvent = () => setIsPlaying(false);
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onEmptied = () => setIsPlaying(false);

    // One-shot auto-retry on a genuine audio error (expired/invalid URL,
    // transient network failure, etc.) — closes the gap needsFreshUrlRef's
    // proactive check can't cover (e.g. resuming after a long mid-track
    // pause, not just a full track end). Guarded by `retrying` so a track
    // that's genuinely broken fails once rather than looping.
    let retrying = false;
    const onError = () => {
      setIsPlaying(false);
      setLoading(false);
      console.error("[player] audio element error", audio.error?.code, audio.error?.message);
      const { current: cur, queue: q } = guardRef.current;
      if (cur && !retrying) {
        retrying = true;
        playRef.current(cur, q).finally(() => {
          retrying = false;
        });
      }
    };

    const onEnded = async () => {
      const { repeatMode: mode, queue: q, queueIndex: idx } = guardRef.current;
      if (mode === "one") {
        // Re-fetch through play() rather than a bare seek+audio.play() — the
        // signed audio URL loaded when this play-through started may already
        // be past its 300s expiry by the time the track finishes.
        playRef.current(q[idx], q);
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
      // End of the playlist/album with repeat off — rather than just going
      // silent, fall back to the offline library so something keeps playing,
      // most recently downloaded first.
      try {
        const downloads = await listDownloads();
        const justFinishedId = q[idx]?.trackId;
        const fallbackQueue = downloads
          .sort((a, b) => b.downloadedAt - a.downloadedAt)
          .filter((d) => d.trackId !== justFinishedId)
          .map((d) => ({
            trackId: d.trackId,
            title: d.title,
            artistName: d.artistName,
            artworkUrl: d.artworkUrl,
            lyricsText: null,
            kind: "track" as const,
            productId: d.productId,
          }));
        if (fallbackQueue.length > 0) {
          playRef.current(fallbackQueue[0], fallbackQueue);
          return;
        }
      } catch {
        // Offline store unavailable — fall through to just stopping below.
      }
      // Truly nothing else to play — reset position explicitly (rather than
      // relying on the browser's implicit ended-state replay behavior) so a
      // lock-screen "play" press afterward deterministically restarts this
      // track, and a lock-screen "previous" press afterward correctly jumps
      // to the prior track instead of re-triggering the position>3s "restart
      // current track" branch in `previous()`. Also flag that whenever
      // playback resumes from here, it needs a fresh signed URL rather than
      // resuming this stale <audio> element in place — see needsFreshUrlRef.
      audio.currentTime = 0;
      setPositionSec(0);
      needsFreshUrlRef.current = true;
      // isPlaying already false via the 'pause' event the native end-of-media
      // stop fires; no need to set it here too.
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPauseEvent);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("stalled", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("canplaythrough", onCanPlay);
    audio.addEventListener("emptied", onEmptied);
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPauseEvent);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("stalled", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("canplaythrough", onCanPlay);
      audio.removeEventListener("emptied", onEmptied);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one persistent <audio> element for the app's lifetime; volume applied here is just the initial value, live changes go through setVolume
  }, []);

  // Drives the OS-level "now playing" surface (lock screen, notification
  // shade, headset controls) — title/artwork straight from the current
  // track, with a fixed "album" line as the app watermark (lock screens
  // typically render title/artist/album as the visible hierarchy, so this
  // is the one field that reliably shows "Playing from XOLDOUT" everywhere).
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!current) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artistName,
      album: "Playing from XOLDOUT",
      artwork: current.artworkUrl
        ? [96, 256, 512].map((size) => ({ src: current.artworkUrl!, sizes: `${size}x${size}` }))
        : [],
    });
  }, [current]);

  // "none" (rather than "paused") when nothing is loaded at all — lets the
  // OS distinguish "no media session" from "media session, paused".
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = !current ? "none" : isPlaying ? "playing" : "paused";
  }, [isPlaying, current]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (isPlaying) {
      audio.pause();
    } else if (needsFreshUrlRef.current) {
      // The loaded <audio> src may be past its signed-URL expiry (see
      // needsFreshUrlRef) — re-fetch via play() instead of resuming in
      // place, which would otherwise silently produce no audio.
      play(current, queue);
    } else {
      audio.play().catch(() => {
        // Resume rejected for a reason needsFreshUrlRef didn't anticipate
        // (e.g. the URL went stale mid-pause, not at a natural track end) —
        // the 'error' listener's own retry covers this too, but retrying
        // immediately here avoids waiting on that event to fire.
        play(current, queue);
      });
    }
  }, [isPlaying, current, queue, play]);

  const seek = useCallback(
    (sec: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      let clamped = sec;
      if (!entitled && previewStartSec !== null && previewEndSec !== null) {
        clamped = Math.min(Math.max(sec, previewStartSec), previewEndSec);
      } else {
        clamped = Math.max(0, Number.isFinite(audio.duration) && audio.duration > 0 ? Math.min(clamped, audio.duration) : clamped);
      }
      audio.currentTime = clamped;
      setPositionSec(clamped);
    },
    [entitled, previewStartSec, previewEndSec],
  );

  const cycleRepeat = useCallback(() => {
    setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"));
  }, []);

  // Shuffles everything after the currently-playing track, keeping it in
  // place at the front — turning shuffle back off restores the exact
  // original order (remembered in originalQueueRef) rather than re-sorting.
  const originalQueueRef = useRef<PlayableTrack[] | null>(null);
  const toggleShuffle = useCallback(() => {
    setQueue((currentQueue) => {
      if (currentQueue.length === 0) return currentQueue;
      if (!shuffled) {
        originalQueueRef.current = currentQueue;
        const playingTrack = currentQueue[queueIndex];
        const rest = currentQueue.filter((_, i) => i !== queueIndex);
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        setQueueIndex(0);
        return playingTrack ? [playingTrack, ...rest] : rest;
      }
      const original = originalQueueRef.current ?? currentQueue;
      const playingTrack = currentQueue[queueIndex];
      const restoredIndex = playingTrack ? original.findIndex((t) => t.trackId === playingTrack.trackId) : 0;
      setQueueIndex(restoredIndex === -1 ? 0 : restoredIndex);
      originalQueueRef.current = null;
      return original;
    });
    setShuffled((s) => !s);
  }, [shuffled, queueIndex]);

  // Skip to the next track in the current (possibly shuffled) queue.
  const next = useCallback(() => {
    if (queueIndex < queue.length - 1) {
      play(queue[queueIndex + 1], queue);
    } else if (repeatMode === "all" && queue.length > 0) {
      // Manual skip on the last track of a repeat-all album/EP/playlist
      // should wrap to the first track — same as what already happens when
      // the track ends naturally (onEnded's mode === "all" branch), just
      // triggered by the Next button (in-app or lock-screen) instead.
      play(queue[0], queue);
    }
  }, [queue, queueIndex, play, repeatMode]);

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
  // something, not just display — the exact same functions the in-app
  // player buttons call, so there is only ever one playback implementation.
  // Re-registered whenever these identities change (isPlaying/queue
  // position shift them), which is cheap — just reassigning a few handlers.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    safeSetActionHandler("play", togglePlay);
    safeSetActionHandler("pause", togglePlay);
    safeSetActionHandler("stop", () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
      setPositionSec(0);
    });
    safeSetActionHandler("previoustrack", previous);
    safeSetActionHandler("nexttrack", next);
    safeSetActionHandler("seekbackward", (details) => {
      const audio = audioRef.current;
      if (!audio) return;
      seek(Math.max(0, audio.currentTime - (details.seekOffset ?? 10)));
    });
    safeSetActionHandler("seekforward", (details) => {
      const audio = audioRef.current;
      if (!audio) return;
      const max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Infinity;
      seek(Math.min(max, audio.currentTime + (details.seekOffset ?? 10)));
    });
    safeSetActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) seek(details.seekTime);
    });
    return () => {
      safeSetActionHandler("play", null);
      safeSetActionHandler("pause", null);
      safeSetActionHandler("stop", null);
      safeSetActionHandler("previoustrack", null);
      safeSetActionHandler("nexttrack", null);
      safeSetActionHandler("seekbackward", null);
      safeSetActionHandler("seekforward", null);
      safeSetActionHandler("seekto", null);
    };
  }, [togglePlay, previous, next, seek]);

  // Safety net for cases the audio element's own events might miss syncing
  // promptly around a background/foreground transition (locking/unlocking
  // the device, switching apps and back) — reconcile React state against
  // the actual audio element whenever the page becomes visible/active
  // again. The event listeners above are the primary mechanism (they fire
  // regardless of tab visibility); this just corrects any drift.
  useEffect(() => {
    function reconcile() {
      const audio = audioRef.current;
      if (!audio || !current) return;
      const reallyPlaying = !audio.paused && !audio.ended;
      setIsPlaying((prev) => (prev === reallyPlaying ? prev : reallyPlaying));
    }
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("pageshow", reconcile);
    window.addEventListener("focus", reconcile);
    return () => {
      document.removeEventListener("visibilitychange", reconcile);
      window.removeEventListener("pageshow", reconcile);
      window.removeEventListener("focus", reconcile);
    };
  }, [current]);

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
        shuffled,
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
        toggleShuffle,
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
