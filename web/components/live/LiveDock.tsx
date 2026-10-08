"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { InitialsAvatar } from "@/components/live/LiveCard";
import { closeDockedLive, getDockedLive, roomListeners, subscribeDockedLive } from "@/lib/live/dock";

// The mini, draggable Live player shown on every page while a Live is
// docked (lib/live/dock.ts). Shows the host's camera (the host sees their
// own), plays the room's sound, taps back to the full Live, and × leaves —
// or, for the host, ends the Live.

const W = 112;
const H = 176;
const EDGE = 12;

export function LiveDock() {
  const live = useSyncExternalStore(subscribeDockedLive, getDockedLive, () => null);
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLDivElement | null>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null);
  const [ending, setEnding] = useState(false);
  // The Live's own page is taking it back — nothing to show there.
  const fullPath = live ? (live.role === "host" ? `/live/${live.liveId}/broadcast` : `/live/${live.liveId}`) : null;
  const visible = !!live && pathname !== fullPath;

  // Video + sound for whatever's docked.
  useEffect(() => {
    if (!live || !visible) return;
    const { room } = live;
    const video = videoRef.current;
    const audioBox = audioRef.current;
    const listen = roomListeners(room);

    const showVideo = () => {
      if (!video) return;
      const track =
        live.role === "host"
          ? room.localParticipant.getTrackPublication(Track.Source.Camera)?.track
          : live.hostId
            ? room.remoteParticipants.get(live.hostId)?.getTrackPublication(Track.Source.Camera)?.track
            : undefined;
      if (track && !track.isMuted) {
        track.attach(video);
        setHasVideo(true);
      } else {
        setHasVideo(false);
      }
    };
    const attachAudio = (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach();
      el.setAttribute("playsinline", "true");
      audioBox?.appendChild(el);
    };

    room.remoteParticipants.forEach((p) =>
      p.trackPublications.forEach((pub) => {
        if (pub.track && pub.track.kind === Track.Kind.Audio) attachAudio(pub.track as RemoteTrack);
      }),
    );
    showVideo();
    listen.on(RoomEvent.TrackSubscribed, (track) => {
      attachAudio(track);
      showVideo();
    });
    listen.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) track.detach().forEach((el) => el.remove());
      showVideo();
    });
    listen.on(RoomEvent.TrackMuted, showVideo);
    listen.on(RoomEvent.TrackUnmuted, showVideo);
    listen.on(RoomEvent.LocalTrackPublished, showVideo);

    return () => {
      listen.offAll();
      // Hand the elements back clean — the full Live page attaches its own.
      room.remoteParticipants.forEach((p) => p.trackPublications.forEach((pub) => pub.track?.detach()));
      room.localParticipant.getTrackPublication(Track.Source.Camera)?.track?.detach();
      if (audioBox) audioBox.innerHTML = "";
    };
  }, [live, visible]);

  if (!live || !visible || !fullPath) return null;
  const href = fullPath;

  const x = pos?.x ?? (typeof window !== "undefined" ? window.innerWidth - W - EDGE : EDGE);
  const y = pos?.y ?? (typeof window !== "undefined" ? window.innerHeight - H - 96 : EDGE);

  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - x, dy: e.clientY - y, startX: e.clientX, startY: e.clientY, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 6) d.moved = true;
    if (!d.moved) return;
    setPos({
      x: Math.min(Math.max(EDGE, e.clientX - d.dx), window.innerWidth - W - EDGE),
      y: Math.min(Math.max(EDGE, e.clientY - d.dy), window.innerHeight - H - EDGE),
    });
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      router.push(href);
      return;
    }
    // Snap to the nearer side, like a phone's picture-in-picture.
    setPos((p) => (p ? { ...p, x: p.x + W / 2 < window.innerWidth / 2 ? EDGE : window.innerWidth - W - EDGE } : p));
  }

  async function close(e: React.MouseEvent) {
    e.stopPropagation();
    if (!live) return;
    if (live.role === "viewer") return closeDockedLive();
    if (!(await toast.confirm("End your Live for everyone?", { confirmLabel: "End Live", destructive: true }))) return;
    setEnding(true);
    try {
      const res = await apiFetch(`/api/live/${live.liveId}/end`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) toast.liveSummary(data.summary);
      else toast.error(data.error ?? "Could not end your Live");
    } finally {
      closeDockedLive();
      setEnding(false);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={live.role === "host" ? "Your Live — tap to open" : `${live.hostName}'s Live — tap to open`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={(e) => e.key === "Enter" && router.push(href)}
      style={{ left: x, top: y, width: W, height: H, touchAction: "none" }}
      className="fixed z-[60] cursor-grab overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-[#3a1460] to-[#0d0614] shadow-[0_12px_40px_rgba(0,0,0,0.6)] transition-[left] duration-200 active:cursor-grabbing"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full object-cover ${live.role === "host" ? "-scale-x-100" : ""} ${hasVideo ? "" : "hidden"}`}
      />
      <div ref={audioRef} className="hidden" aria-hidden />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <FallbackImg
            src={live.hostAvatarUrl}
            alt={live.hostName}
            className="h-14 w-14 rounded-full object-cover border border-white/20"
            fallback={<InitialsAvatar name={live.hostName || "?"} className="h-14 w-14 text-lg" />}
          />
        </div>
      )}
      <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-red px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
        <span className="h-1 w-1 rounded-full bg-white" aria-hidden />
        Live
      </span>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={close}
        disabled={ending}
        aria-label={live.role === "host" ? "End your Live" : "Leave this Live"}
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-[14px] text-white disabled:opacity-50"
      >
        ×
      </button>
      <p className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4 text-[11px] font-semibold text-white">
        {live.role === "host" ? "You're live" : live.hostName}
      </p>
    </div>
  );
}
