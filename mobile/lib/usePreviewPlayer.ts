import { useEffect, useRef, useState } from "react";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { apiGet } from "./api";

type PreviewKind = "track" | "beat";

type AudioUrlResponse = {
  url: string;
  previewStartSec: number | null;
  previewEndSec: number | null;
};

// Fetches a short-TTL signed preview URL from the same audio-url endpoints
// the web player uses (GET /api/tracks/:id/audio-url, /api/beats/:id/audio-url
// — both return preview-only audio for a signed-out request, see those
// routes' own comments), then plays it with a single shared AudioPlayer so
// starting one preview stops whatever else was playing.
export function usePreviewPlayer() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // previewEndSec matters only for rows published before the real
  // trimmed-clip backfill (see audio-url routes) — a real preview clip's own
  // duration already stops it, this is a fallback clamp on top.
  const windowRef = useRef<{ start: number; end: number | null }>({ start: 0, end: null });

  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);

  // Deliberately keyed on just `url`/`status.currentTime` — re-running on
  // every `player`/`status` identity change (expo-audio recreates both
  // often) would fight the seek and re-trigger play on each status tick.
  useEffect(() => {
    if (!url) return;
    player.seekTo(windowRef.current.start);
    player.play();
  }, [url]);

  useEffect(() => {
    const end = windowRef.current.end;
    if (end !== null && status.playing && status.currentTime >= end) {
      player.pause();
    }
  }, [status.currentTime]);

  async function toggle(kind: PreviewKind, id: string) {
    if (activeId === id) {
      if (status.playing) player.pause();
      else player.play();
      return;
    }
    setError(null);
    setLoadingId(id);
    try {
      const path = kind === "track" ? `/api/tracks/${id}/audio-url` : `/api/beats/${id}/audio-url`;
      const data = await apiGet<AudioUrlResponse>(path);
      windowRef.current = { start: data.previewStartSec ?? 0, end: data.previewEndSec };
      setActiveId(id);
      setUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Playback failed");
    } finally {
      setLoadingId(null);
    }
  }

  return {
    isPlaying: (id: string) => activeId === id && status.playing,
    isLoading: (id: string) => loadingId === id,
    error,
    toggle,
  };
}
