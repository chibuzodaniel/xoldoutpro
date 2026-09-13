import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { apiGet } from "./api";
import { useAuth } from "./AuthContext";
import type { PlayableTrack } from "./playerTypes";
import { getOfflinePlaybackUri, isDownloaded } from "./offline/downloads";

type PlayerState = {
  current: PlayableTrack | null;
  queue: PlayableTrack[];
  isPlaying: boolean;
  loading: boolean;
  error: string | null;
  play: (track: PlayableTrack, queue?: PlayableTrack[]) => void;
  togglePlay: () => void;
  playNext: (tracks: PlayableTrack[]) => void;
  skipToNext: () => void;
};

const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { firebaseUser } = useAuth();
  const [queue, setQueue] = useState<PlayableTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards the "auto-advance on finish" effect from re-firing for a track
  // that already triggered it — didJustFinish stays true for a render or
  // two after the transition, not just the one tick it changed on.
  const advancedForRef = useRef<string | null>(null);

  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const current = queue[queueIndex] ?? null;

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
    const q = newQueue ?? [track];
    const idx = q.findIndex((t) => t.trackId === track.trackId);
    setQueue(q);
    setQueueIndex(idx === -1 ? 0 : idx);
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

  function skipToNext() {
    if (queueIndex + 1 >= queue.length) return;
    const track = queue[queueIndex + 1];
    setQueueIndex(queueIndex + 1);
    loadAndPlay(track);
  }

  useEffect(() => {
    if (url) player.play();
  }, [url]);

  // Auto-advance when a track finishes, rather than just stopping.
  useEffect(() => {
    if (!current || !status.didJustFinish || advancedForRef.current === current.trackId) return;
    advancedForRef.current = current.trackId;
    skipToNext();
  }, [status.didJustFinish]);

  return (
    <PlayerContext.Provider
      value={{
        current,
        queue,
        isPlaying: status.playing,
        loading,
        error: error ?? status.error,
        play,
        togglePlay,
        playNext,
        skipToNext,
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
