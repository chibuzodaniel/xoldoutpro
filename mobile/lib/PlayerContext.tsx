import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
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
  positionSec: number;
  durationSec: number;
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

const PlayerContext = createContext<PlayerState | null>(null);

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

  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const current = queue[queueIndex] ?? null;

  // Native single-track loop for repeat-one — expo-audio handles the replay
  // itself, so the finish-listener below deliberately skips advancing while
  // this is on (see that effect's own guard).
  useEffect(() => {
    player.loop = repeatMode === "one";
  }, [player, repeatMode]);

  async function loadAndPlay(track: PlayableTrack) {
    setLoading(true);
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
      const path = track.kind === "beat" ? `/api/beats/${track.trackId}/audio-url` : `/api/tracks/${track.trackId}/audio-url`;
      const idToken = firebaseUser ? await firebaseUser.getIdToken() : undefined;
      const data = await apiGet<{ url: string }>(path, idToken);
      setUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Playback failed");
    } finally {
      setLoading(false);
    }
  }

  function play(track: PlayableTrack, newQueue?: PlayableTrack[]) {
    const q = newQueue && newQueue.length > 0 ? newQueue : [track];
    const idx = q.findIndex((t) => t.trackId === track.trackId);
    setQueue(q);
    setQueueIndex(idx === -1 ? 0 : idx);
    originalQueueRef.current = null;
    setShuffled(false);
    loadAndPlay(track);
  }

  function togglePlay() {
    if (!current) return;
    if (status.playing) player.pause();
    else player.play();
  }

  function playNext(tracks: PlayableTrack[]) {
    if (tracks.length === 0) return;
    setQueue((q) => {
      const before = q.slice(0, queueIndex + 1);
      const after = q.slice(queueIndex + 1);
      return [...before, ...tracks, ...after];
    });
  }

  function seek(sec: number) {
    const clamped = Math.max(0, status.duration > 0 ? Math.min(sec, status.duration) : sec);
    player.seekTo(clamped);
  }

  // Manual skip: honors repeat-all's wrap-to-first at the end of the queue,
  // same as the natural-finish handler below, but ignores repeat-one (a
  // deliberate "next" tap should always move forward, not replay).
  function next() {
    if (queueIndex < queue.length - 1) {
      const track = queue[queueIndex + 1];
      setQueueIndex(queueIndex + 1);
      loadAndPlay(track);
    } else if (repeatMode === "all" && queue.length > 0) {
      setQueueIndex(0);
      loadAndPlay(queue[0]);
    }
  }

  // Mirrors the near-universal "tap back = restart this track, tap back
  // again quickly = go to the previous one" convention.
  function previous() {
    if (status.currentTime > 3 || queueIndex === 0) {
      seek(0);
    } else {
      const track = queue[queueIndex - 1];
      setQueueIndex(queueIndex - 1);
      loadAndPlay(track);
    }
  }

  function cycleRepeat() {
    setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"));
  }

  // Shuffles everything after the currently-playing track, keeping it in
  // place at the front — turning shuffle back off restores the exact
  // original order rather than re-sorting.
  function toggleShuffle() {
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
  }

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

  return (
    <PlayerContext.Provider
      value={{
        current,
        queue,
        queueIndex,
        isPlaying: status.playing,
        loading,
        error: error ?? status.error,
        positionSec: status.currentTime,
        durationSec: status.duration,
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
