// Xoldout Live's video layer — LiveKit Cloud, chosen over an RTMP/HLS
// broadcast-only provider (Mux etc.) specifically because "request to
// participate" (bringing a viewer on-camera) needs real two-way WebRTC, not
// just low-latency playback. Rooms are ephemeral (explicit product
// decision: "Lives aren't saved") — nothing here ever starts an Egress/
// recording, and a room is torn down the moment its LiveSession ends.
//
// Requires LIVEKIT_URL/LIVEKIT_API_KEY/LIVEKIT_API_SECRET (a LiveKit Cloud
// project's own values — see https://cloud.livekit.io). LIVEKIT_URL is the
// wss:// URL clients connect to directly; RoomServiceClient accepts that
// same value and normalizes ws(s) -> http(s) internally for its REST calls.

import { AccessToken, RoomServiceClient, DataPacket_Kind } from "livekit-server-sdk";

function env(name: "LIVEKIT_URL" | "LIVEKIT_API_KEY" | "LIVEKIT_API_SECRET"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.local.example.`);
  return value;
}

let cachedClient: RoomServiceClient | null = null;
function roomService(): RoomServiceClient {
  if (!cachedClient) {
    cachedClient = new RoomServiceClient(env("LIVEKIT_URL"), env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"));
  }
  return cachedClient;
}

/** Public value clients need to actually connect — never the API key/secret. */
export function getLiveKitUrl(): string {
  return env("LIVEKIT_URL");
}

/**
 * One room per LiveSession. The caller (lib/live/sessions.ts's
 * startLiveSession) generates `uniqueSeed` itself before the session row
 * exists, so room creation is never a second step racing the row's own
 * unique roomName constraint. `emptyTimeout` is short — a room nobody's
 * actually connected to (the host disconnected without calling the
 * end-live route, e.g. a crashed app) shouldn't linger and keep billing
 * participant-minutes.
 */
export async function createLiveKitRoom(uniqueSeed: string): Promise<string> {
  const roomName = `live-${uniqueSeed}`;
  await roomService().createRoom({ name: roomName, emptyTimeout: 60, departureTimeout: 30 });
  return roomName;
}

export async function endLiveKitRoom(roomName: string): Promise<void> {
  // deleteRoom disconnects every remaining participant too — the intended
  // behavior for "creator hit End live," not just a metadata cleanup.
  await roomService().deleteRoom(roomName).catch(() => {
    // Already gone (e.g. emptyTimeout already reaped it) — end-live is
    // idempotent, not an error.
  });
}

/** Room names of every currently-live session, for the "Live now" rails — cross-checked against LiveSession.status by the caller, not trusted alone (a room can outlive its DB row briefly, or vice versa if a webhook is slow). */
export async function listActiveRoomNames(): Promise<Set<string>> {
  const rooms = await roomService().listRooms();
  return new Set(rooms.map((r) => r.name));
}

/** Current participant count per room name, in one listRooms call — the "Live now" cards' 👁 counts. */
export async function getRoomViewerCounts(): Promise<Map<string, number>> {
  const rooms = await roomService().listRooms();
  return new Map(rooms.map((r) => [r.name, r.numParticipants]));
}

/**
 * Authoritative current participant count, straight from LiveKit — not a
 * client-reported number (any viewer's page could send a fake one). Used
 * to update LiveSession.peakViewers on join (lib/live/sessions.ts's
 * recordViewerJoin), never trusted from the request body.
 */
export async function getParticipantCount(roomName: string): Promise<number> {
  const participants = await roomService().listParticipants(roomName);
  return participants.length;
}

/**
 * Host token: full publish (camera/mic) + room admin (mute/kick — the
 * moderation the write-up's chat/participation features need). Never
 * request this for anyone but the session's own creator — checked by the
 * caller (app/api/live/[id]/join's route), not here.
 */
export async function createHostToken(args: { roomName: string; userId: string; displayName: string }): Promise<string> {
  const token = new AccessToken(env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"), {
    identity: args.userId,
    name: args.displayName,
    ttl: "6h",
  });
  token.addGrant({ room: args.roomName, roomJoin: true, roomAdmin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return token.toJwt();
}

/**
 * Viewer token: subscribe-only, plus data publish for chat/gift-reaction
 * messages (the LiveKit room's own data channel is this app's live-chat
 * transport — see prisma/schema.prisma's Live section comment for why nothing
 * chat-shaped is ever written to Postgres).
 */
export async function createViewerToken(args: { roomName: string; userId: string; displayName: string }): Promise<string> {
  const token = new AccessToken(env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"), {
    identity: args.userId,
    name: args.displayName,
    ttl: "6h",
  });
  token.addGrant({ room: args.roomName, roomJoin: true, roomAdmin: false, canPublish: false, canSubscribe: true, canPublishData: true });
  return token.toJwt();
}

/**
 * Server-authoritative broadcast to everyone currently in the room — used
 * right after a gift/paid-access purchase actually clears (debitCoins +
 * creditCreatorFromCoins both committed), never published by a client
 * directly, so nobody can fake a gift animation nobody paid for.
 */
export async function publishLiveEvent(roomName: string, event: Record<string, unknown>): Promise<void> {
  const data = new TextEncoder().encode(JSON.stringify(event));
  await roomService().sendData(roomName, data, DataPacket_Kind.RELIABLE, { topic: "live-event" });
}
