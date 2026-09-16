import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { apiGet } from "./api";
import { useAuth } from "./AuthContext";
import type { PlayableTrack } from "./playerTypes";
import { getOfflinePlaybackUri, isDownloaded } from "./offline/downloads";

type RepeatMode = "off" | "all" | "one";

type PlayerState = {
  current: PlayableTrack | null;
  queue: PlayableTrack[];
  queueIndex: number;
  isPlaying: boolean;
  loading: boolean;
  error: string | null;
  repeatMode: RepeatMode;
  shuffled: boolean;
  play: (track: PlayableTrack, queue?: PlayableTrack[]) => void;
  togglePlay: () => void;
  playNext: (tracks: PlayableTrack[]) => void;
  seek: (sec: number) => void;
  next: () => void;
  previous: () => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
};

type PlayerProgress = { positionSec: number; durationSec: number };

const PlayerContext = createContext<PlayerState | null>(null);
// Split out from PlayerState because positionSec/durationSec tick every
// ~500ms during playback — bundling them into the main context value meant
// every consumer (MiniPlayer, ProductScreen, every Library screen) re-rendered
// twice a second whenever anything was playing anywhere in the app, even
// components that never read position at all. Only PlayerScreen's seek bar
// actually needs this.
const PlayerProgressContext = createContext<PlayerProgress>({ positionSec: 0, durationSec: 0 });

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { firebaseUser } = useAuth();
  const [queue, setQueue] = useState<PlayableTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [shuffled, setShuffled] = useState(false);
  // Guards the "auto-advance on finish" effect from re-firing for a track
  // that already triggered it — didJustFinish stays true for a render or
  // two after the transition, not just the one tick it changed on.
  const advancedForRef = useRef<string | null>(null);
  // Remembers the pre-shuffle order so toggling shuffle back off restores it
  // exactly, same approach as web's PlayerProvider.
  const originalQueueRef = useRef<PlayableTrack[] | null>(null);
  // Signed audio-url responses are cached client-side for less than the
  // server's own 300s presign TTL (see app/api/tracks/[id]/audio-url on
  // web) — a track played again shortly after (pause/resume, replaying,
  // revisiting a product page) starts immediately instead of showing
  // "loading" for a network round-trip whose answer hasn't changed.
  const urlCacheRef = useRef<Map<string, { url: string; expiresAt: number }>>(new Map());

  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const current = queue[queueIndex] ?? null;

  // Always-fresh snapshot of playback status for callbacks below, so those
  // callbacks can stay referentially stable (not recreated every ~500ms
  // tick) without reading stale position/duration/playing values.
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Lets playback continue with the screen locked or the app backgrounded,
  // and required (doNotMix) for the OS to associate lock screen / notification
  // controls with this player at all.
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    });
  }, []);

  // Native single-track loop for repeat-one — expo-audio handles the replay
  // itself, so the finish-listener below deliberately skips advancing while
  // this is on (see that effect's own guard).
  useEffect(() => {
    player.loop = repeatMode === "one";
  }, [player, repeatMode]);

  // Surfaces the mini player as lock screen / notification "now playing"
  // controls — each url change swaps in a new native player instance, so
  // this has to re-claim lock screen control every time, not just on mount.
  useEffect(() => {
    if (!current) return;
    player.setActiveForLockScreen(
      true,
      { title: current.title, artist: current.artistName, artworkUrl: current.artworkUrl ?? undefined },
      { showSeekForward: true, showSeekBackward: true }
    );
  }, [player, current]);

  const cacheKeyFor = useCallback((track: PlayableTrack) => `${track.kind ?? "track"}:${track.trackId}`, []);

  // Shared by loadAndPlay and the next-track prefetch below — resolves from
  // cache without ever touching the network when there's a fresh entry.
  const fetchAudioUrl = useCallback(
    async (track: PlayableTrack): Promise<string> => {
      const key = cacheKeyFor(track);
      const cached = urlCacheRef.current.get(key);
      if (cached && cached.expiresAt > Date.now()) return cached.url;
      const path = track.kind === "beat" ? `/api/beats/${track.trackId}/audio-url` : `/api/tracks/${track.trackId}/audio-url`;
      const idToken = firebaseUser ? await firebaseUser.getIdToken() : undefined;
      const data = await apiGet<{ url: string }>(path, idToken);
      // 270s: comfortably under the server's 300s presign, so a cache hit
      // is never handed a URL that's about to expire mid-request.
      urlCacheRef.current.set(key, { url: data.url, expiresAt: Date.now() + 270_000 });
      return data.url;
    },
    [firebaseUser, cacheKeyFor],
  );

  const loadAndPlay = useCallback(
    async (track: PlayableTrack) => {
      setError(null);
      try {
        // Beats have no offline cache format (DECISIONS.md, matching web) —
        // only a release's individual tracks can be downloaded.
        if (track.kind !== "beat" && (await isDownloaded(track.trackId))) {
          const offlineUri = await getOfflinePlaybackUri(track.trackId);
          if (offlineUri) {
            setUrl(offlineUri);
            return;
          }
        }
        // A cache hit resolves synchronously-ish (no fetch), so skip the
        // loading flag entirely for it — that's the whole point.
        const key = cacheKeyFor(track);
        const cached = urlCacheRef.current.get(key);
        if (cached && cached.expiresAt > Date.now()) {
          setUrl(cached.url);
          return;
        }
        setLoading(true);
        const url = await fetchAudioUrl(track);
        setUrl(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Playback failed");
      } finally {
        setLoading(false);
      }
    },
    [cacheKeyFor, fetchAudioUrl],
  );

  // Warms the cache for whatever plays next, so tapping "skip" (or letting
  // a track finish) hits the cache instead of waiting on a fresh presign —
  // or, for a downloaded track, instead of waiting on the pure-JS AES
  // decrypt (genuinely slow for a multi-MB file) that getOfflinePlaybackUri
  // would otherwise only start once "next" is actually tapped.
  useEffect(() => {
    const upcoming = queue[queueIndex + 1];
    if (!upcoming) return;
    (async () => {
      if (upcoming.kind !== "beat" && (await isDownloaded(upcoming.trackId))) {
        await getOfflinePlaybackUri(upcoming.trackId);
      } else {
        await fetchAudioUrl(upcoming);
      }
    })().catch(() => {});
  }, [queue, queueIndex, fetchAudioUrl]);

  const play = useCallback(
    (track: PlayableTrack, newQueue?: PlayableTrack[]) => {
      const q = newQueue && newQueue.length > 0 ? newQueue : [track];
      const idx = q.findIndex((t) => t.trackId === track.trackId);
      setQueue(q);
      setQueueIndex(idx === -1 ? 0 : idx);
      originalQueueRef.current = null;
      setShuffled(false);
      loadAndPlay(track);
    },
    [loadAndPlay],
  );

  const togglePlay = useCallback(() => {
    if (!current) return;
    if (statusRef.current.playing) player.pause();
    else player.play();
  }, [current, player]);

  const playNext = useCallback(
    (tracks: PlayableTrack[]) => {
      if (tracks.length === 0) return;
      setQueue((q) => {
        const before = q.slice(0, queueIndex + 1);
        const after = q.slice(queueIndex + 1);
        return [...before, ...tracks, ...after];
      });
    },
    [queueIndex],
  );

  const seek = useCallback(
    (sec: number) => {
      const duration = statusRef.current.duration;
      const clamped = Math.max(0, duration > 0 ? Math.min(sec, duration) : sec);
      player.seekTo(clamped);
    },
    [player],
  );

  // Manual skip: honors repeat-all's wrap-to-first at the end of the queue,
  // same as the natural-finish handler below, but ignores repeat-one (a
  // deliberate "next" tap should always move forward, not replay).
  const next = useCallback(() => {
    if (queueIndex < queue.length - 1) {
      const track = queue[queueIndex + 1];
      setQueueIndex(queueIndex + 1);
      loadAndPlay(track);
    } else if (repeatMode === "all" && queue.length > 0) {
      setQueueIndex(0);
      loadAndPlay(queue[0]);
    }
  }, [queue, queueIndex, repeatMode, loadAndPlay]);

  // Mirrors the near-universal "tap back = restart this track, tap back
  // again quickly = go to the previous one" convention.
  const previous = useCallback(() => {
    if (statusRef.current.currentTime > 3 || queueIndex === 0) {
      seek(0);
    } else {
      const track = queue[queueIndex - 1];
      setQueueIndex(queueIndex - 1);
      loadAndPlay(track);
    }
  }, [queue, queueIndex, seek, loadAndPlay]);

  const cycleRepeat = useCallback(() => {
    setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"));
  }, []);

  // Shuffles everything after the currently-playing track, keeping it in
  // place at the front — turning shuffle back off restores the exact
  // original order rather than re-sorting.
  const toggleShuffle = useCallback(() => {
    if (queue.length === 0) return;
    if (!shuffled) {
      originalQueueRef.current = queue;
      const playingTrack = queue[queueIndex];
      const rest = queue.filter((_, i) => i !== queueIndex);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      setQueue(playingTrack ? [playingTrack, ...rest] : rest);
      setQueueIndex(0);
    } else {
      const original = originalQueueRef.current ?? queue;
      const playingTrack = queue[queueIndex];
      const restoredIndex = playingTrack ? original.findIndex((t) => t.trackId === playingTrack.trackId) : 0;
      setQueue(original);
      setQueueIndex(restoredIndex === -1 ? 0 : restoredIndex);
      originalQueueRef.current = null;
    }
    setShuffled((s) => !s);
  }, [queue, queueIndex, shuffled]);

  useEffect(() => {
    if (url) player.play();
  }, [url]);

  // Auto-advance when a track finishes, rather than just stopping. Skipped
  // entirely under repeat-one — player.loop (above) already handles the
  // replay natively, and didJustFinish firing here too would double-trigger.
  useEffect(() => {
    if (!current || !status.didJustFinish || repeatMode === "one" || advancedForRef.current === current.trackId) return;
    advancedForRef.current = current.trackId;
    if (queueIndex < queue.length - 1) {
      const track = queue[queueIndex + 1];
      setQueueIndex(queueIndex + 1);
      loadAndPlay(track);
    } else if (repeatMode === "all" && queue.length > 0) {
      setQueueIndex(0);
      loadAndPlay(queue[0]);
    }
    // Nothing left and repeat is off — stays stopped, same as web's queue-exhausted case.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-runs only on didJustFinish edges, not on every queue/index change
  }, [status.didJustFinish]);

  const value = useMemo<PlayerState>(
    () => ({
      current,
      queue,
      queueIndex,
      isPlaying: status.playing,
      loading,
      error: error ?? status.error,
      repeatMode,
      shuffled,
      play,
      togglePlay,
      playNext,
      seek,
      next,
      previous,
      cycleRepeat,
      toggleShuffle,
    }),
    [current, queue, queueIndex, status.playing, loading, error, status.error, repeatMode, shuffled, play, togglePlay, playNext, seek, next, previous, cycleRepeat, toggleShuffle],
  );

  const progress = useMemo<PlayerProgress>(
    () => ({ positionSec: status.currentTime, durationSec: status.duration }),
    [status.currentTime, status.duration],
  );

  return (
    <PlayerContext.Provider value={value}>
      <PlayerProgressContext.Provider value={progress}>{children}</PlayerProgressContext.Provider>
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

// Ticks every ~500ms during playback — only subscribe from something that
// actually renders a progress bar/scrubber (see the context's own comment).
export function usePlayerProgress() {
  return useContext(PlayerProgressContext);
}
