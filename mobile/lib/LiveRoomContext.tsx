import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LiveKitRoom } from "@livekit/react-native";
import { Room } from "livekit-client";
import type { LiveJoinResponse } from "./liveTypes";
import { useLiveAudioSession } from "./liveAudio";

// Keeps a Live connected while its user moves around the rest of the app
// (explicit ask, 2026-10-08: "when a user is live they should be able to
// access other parts of the app, which compresses the Live to a mini
// moveable screen") — mirrors web's lib/live/dock.ts. The LiveKit room
// lives here, at the app root, instead of inside the Live screens: leaving
// a Live screen (back, swipe, the minimise button) keeps the room connected
// and components/live/MiniLivePlayer.tsx floats it over every screen.
// Opening the Live again reuses the same connection — no new join.

export type ActiveLive = {
  liveId: string;
  role: "host" | "viewer";
  join: LiveJoinResponse;
  // The host's on-air clock keeps counting across minimise/restore.
  startedAt: number;
};

type LiveRoomContextValue = {
  active: ActiveLive | null;
  start: (live: ActiveLive) => void;
  stop: () => void;
  // A viewer brought on stage publishes too — switches the audio profile.
  setOnStage: (onStage: boolean) => void;
  cameraBlocked: boolean;
  retryCamera: () => void;
  // The Live screen that's on screen right now (the mini player hides for it).
  visibleLiveId: string | null;
  setVisibleLiveId: (id: string | null) => void;
};

const LiveRoomContext = createContext<LiveRoomContextValue | null>(null);

export function useLiveRoom() {
  const ctx = useContext(LiveRoomContext);
  if (!ctx) throw new Error("useLiveRoom must be used inside LiveRoomProvider");
  return ctx;
}

export function LiveRoomProvider({ children }: { children: React.ReactNode }) {
  const room = useMemo(() => new Room(), []);
  const [active, setActive] = useState<ActiveLive | null>(null);
  const [onStage, setOnStage] = useState(false);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [visibleLiveId, setVisibleLiveId] = useState<string | null>(null);
  const pendingRef = useRef<ActiveLive | null>(null);

  useLiveAudioSession(active ? (active.role === "host" || onStage ? "broadcaster" : "viewer") : null);

  // Switching straight from one Live to another: disconnect first, then join.
  const start = useCallback((next: ActiveLive) => {
    setActive((cur) => {
      if (cur && cur.liveId !== next.liveId) {
        pendingRef.current = next;
        return null;
      }
      return cur ?? next;
    });
    setCameraBlocked(false);
  }, []);
  useEffect(() => {
    if (active || !pendingRef.current) return;
    const next = pendingRef.current;
    pendingRef.current = null;
    const id = setTimeout(() => setActive(next), 50);
    return () => clearTimeout(id);
  }, [active]);

  const stop = useCallback(() => {
    pendingRef.current = null;
    setActive(null);
    setOnStage(false);
    setCameraBlocked(false);
  }, []);

  const retryCamera = useCallback(() => {
    setCameraBlocked(false);
    room.localParticipant
      .enableCameraAndMicrophone()
      .catch(() => setCameraBlocked(true));
  }, [room]);

  const value = useMemo(
    () => ({ active, start, stop, setOnStage, cameraBlocked, retryCamera, visibleLiveId, setVisibleLiveId }),
    [active, start, stop, cameraBlocked, retryCamera, visibleLiveId],
  );

  const isHost = active?.role === "host";
  return (
    <LiveRoomContext.Provider value={value}>
      <LiveKitRoom
        room={room}
        serverUrl={active?.join.url}
        token={active?.join.token}
        connect={!!active}
        video={isHost}
        audio={isHost}
        onMediaDeviceFailure={() => isHost && setCameraBlocked(true)}
        onDisconnected={() => {
          // The Live ended (or the host ended it) while minimised.
          if (room.state === "disconnected") setActive((cur) => (pendingRef.current ? cur : null));
        }}
      >
        {children}
      </LiveKitRoom>
    </LiveRoomContext.Provider>
  );
}
