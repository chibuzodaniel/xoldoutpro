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
  play: (track: PlayableTrack) => void;
  togglePlay: () => void;
  seek: (sec: number) => void;
  cycleRepeat: () => void;
  setExpanded: (v: boolean) => void;
};

const PlayerContext = createContext<PlayerState | null>(null);

// A single persistent <audio> element, held by a provider that wraps the
// authenticated app shell layout — Next.js keeps layout components mounted
// across route changes within it, which is what makes the mini player
// survive tab switches (PRD §9 requirement) without a page reload.
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

  // Read inside the (stable, registered-once) audio event listeners without
  // stale closures — these mirror the state above on every change.
  const guardRef = useRef({ entitled, previewStartSec, previewEndSec, repeatMode });
  useEffect(() => {
    guardRef.current = { entitled, previewStartSec, previewEndSec, repeatMode };
  }, [entitled, previewStartSec, previewEndSec, repeatMode]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onTime = () => {
      setPositionSec(audio.currentTime);
      const { entitled: ent, previewStartSec: start, previewEndSec: end } = guardRef.current;
      if (!ent && start !== null && end !== null && audio.currentTime >= end) {
        audio.currentTime = start;
        audio.pause();
        setIsPlaying(false);
      }
    };
    const onLoaded = () => setDurationSec(audio.duration || 0);
    const onEnded = () => {
      if (guardRef.current.repeatMode === "one" || guardRef.current.repeatMode === "all") {
        audio.currentTime = 0;
        audio.play();
      } else {
        setIsPlaying(false);
      }
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
  }, []);

  const objectUrlRef = useRef<string | null>(null);

  const play = useCallback(async (track: PlayableTrack) => {
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
        play,
        togglePlay,
        seek,
        cycleRepeat,
        setExpanded,
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
