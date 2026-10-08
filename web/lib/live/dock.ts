// Keeps a Live connected while its user moves around the rest of the app
// (explicit ask, 2026-10-08: "when a user is live they should be able to
// access other parts of the app, which compresses the Live to a mini
// moveable screen"). The Live pages create the LiveKit Room; when the user
// navigates away (not when they end or leave the Live) the page parks the
// still-connected Room here instead of disconnecting it, and
// components/live/LiveDock.tsx shows it as a draggable mini player. Opening
// the Live again takes the same Room back — no reconnect, no new join.
//
// Client-only, module-level: a Room isn't serializable and only one Live is
// docked at a time.

import { RoomEvent, type Room, type RoomEventCallbacks } from "livekit-client";

export type DockedLive = {
  liveId: string;
  role: "host" | "viewer";
  room: Room;
  title: string;
  hostName: string;
  hostAvatarUrl: string | null;
  // The host's LiveKit identity — the mini player shows their camera.
  hostId: string | null;
  // Page state worth restoring when the full screen comes back.
  restore: Record<string, unknown>;
};

let docked: DockedLive | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function getDockedLive() {
  return docked;
}

export function subscribeDockedLive(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function onRoomGone() {
  docked = null;
  emit();
}

/** Parks a connected Live. Replaces (and disconnects) any other docked Live. */
export function parkLive(live: DockedLive) {
  if (docked && docked.room !== live.room) docked.room.disconnect();
  docked = live;
  live.room.once(RoomEvent.Disconnected, onRoomGone);
  emit();
}

/** The Live page coming back takes its Room out of the dock. */
export function takeDockedLive(liveId: string): DockedLive | null {
  if (docked?.liveId !== liveId) return null;
  const live = docked;
  live.room.off(RoomEvent.Disconnected, onRoomGone);
  docked = null;
  emit();
  return live;
}

/** Closes the mini player and leaves the Live. */
export function closeDockedLive() {
  const live = docked;
  if (!live) return;
  live.room.off(RoomEvent.Disconnected, onRoomGone);
  docked = null;
  emit();
  live.room.disconnect();
}

/**
 * Registers Room listeners that can be removed again one by one — a page
 * handing its Room to the dock must drop only its own handlers, never
 * anyone else's (removeAllListeners would also strip the dock's).
 */
export function roomListeners(room: Room) {
  const offs: (() => void)[] = [];
  function on<E extends keyof RoomEventCallbacks>(event: E, listener: RoomEventCallbacks[E]) {
    room.on(event, listener);
    offs.push(() => room.off(event, listener));
  }
  return {
    on,
    offAll() {
      offs.splice(0).forEach((off) => off());
    },
  };
}
