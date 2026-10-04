"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RoomEvent, Track, type Participant, type Room, type VideoTrack } from "livekit-client";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { InitialsAvatar } from "@/components/live/LiveCard";
import { BottomSheet } from "@/components/live/BottomSheet";
import { MicLineIcon } from "@/components/live/LiveIcons";

// Live co-hosting UI shared by the host's broadcast page and the viewer page
// (explicit ask, 2026-10-04) — see lib/live/stage.ts for the rules. Three
// pieces: useStageState (the GET /stage view, refreshed whenever the room
// announces a stage/roles change), StageTiles (video tiles for everyone on
// stage except the host) and PeopleSheet (On stage / Requests / Watching,
// for the host and moderators).

export type LiveRole = "host" | "moderator" | "viewer";

export type StagePerson = {
  userId: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  role: LiveRole;
  onStage: boolean;
  joinedAt: number;
};

export type StageRequest = {
  id: string;
  userId: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  createdAt: string;
  stillHere: boolean;
};

export type StageState = {
  role: LiveRole;
  hostId: string;
  maxGuests: number;
  onStage: StagePerson[];
  moderatorIds: string[];
  myRequestStatus: "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED" | null;
  watching: StagePerson[];
  requests: StageRequest[];
};

/** A "live-event" data message about the stage or roles, as sent by lib/live/stage.ts. */
export type StageEvent = {
  kind: "stage" | "roles";
  type: string;
  userId: string;
  displayName?: string;
  byName?: string;
};

export function isStageEvent(data: unknown): data is StageEvent {
  const kind = (data as { kind?: unknown } | null)?.kind;
  return kind === "stage" || kind === "roles";
}

export function useStageState(liveId: string, enabled: boolean) {
  const [state, setState] = useState<StageState | null>(null);
  const refresh = useCallback(async () => {
    const res = await apiFetch(`/api/live/${liveId}/stage`).catch(() => null);
    if (res?.ok) setState(await res.json());
  }, [liveId]);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load once connected
    void refresh();
  }, [enabled, refresh]);

  return { state, refresh };
}

/** POST helpers — return true on success, toasting the server's reason otherwise. */
export function useStageActions(liveId: string, onDone: () => void) {
  const toast = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function run(key: string, path: string, action: string, success?: string) {
    setBusyKey(key);
    try {
      const res = await apiFetch(path, { method: "POST", body: JSON.stringify({ action }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Something went wrong");
        return false;
      }
      if (success) toast.success(success);
      return true;
    } finally {
      setBusyKey(null);
      onDone();
    }
  }

  return {
    busyKey,
    self: (action: "request" | "cancel" | "leave", success?: string) => run(`self:${action}`, `/api/live/${liveId}/stage`, action, success),
    onPerson: (userId: string, action: "approve" | "decline" | "invite" | "remove" | "make-moderator" | "remove-moderator", success?: string) =>
      run(`${userId}:${action}`, `/api/live/${liveId}/stage/${userId}`, action, success),
  };
}

function PersonAvatar({ person, className }: { person: { displayName: string; avatarUrl: string | null }; className: string }) {
  return (
    <FallbackImg
      src={person.avatarUrl}
      alt={person.displayName}
      className={`${className} shrink-0 rounded-full object-cover`}
      fallback={<InitialsAvatar name={person.displayName || "?"} className={`${className} text-[12px]`} />}
    />
  );
}

// ─── Video tiles ──────────────────────────────────────────────────────────

type Tile = { identity: string; name: string; track: VideoTrack | null; isLocal: boolean; micOn: boolean };

function collectTiles(room: Room, excludeIdentity: string | null): Tile[] {
  const participants: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];
  return participants
    .filter((p) => p.identity !== excludeIdentity && p.permissions?.canPublish)
    .map((p) => ({
      identity: p.identity,
      name: p.name || "Guest",
      track: (p.getTrackPublication(Track.Source.Camera)?.track as VideoTrack | undefined) ?? null,
      isLocal: p === room.localParticipant,
      micOn: p.isMicrophoneEnabled,
    }));
}

function VideoTile({ tile, person }: { tile: Tile; person?: StagePerson }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!tile.track || !el) return;
    tile.track.attach(el);
    return () => {
      tile.track?.detach(el);
    };
  }, [tile.track]);

  const name = person?.displayName ?? tile.name;
  return (
    <div className="relative h-36 w-24 overflow-hidden rounded-xl border border-white/20 bg-black/70 shadow-lg">
      {tile.track ? (
        <video ref={videoRef} autoPlay playsInline muted={tile.isLocal} className={`h-full w-full object-cover ${tile.isLocal ? "-scale-x-100" : ""}`} />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <PersonAvatar person={{ displayName: name, avatarUrl: person?.avatarUrl ?? null }} className="h-12 w-12" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-4">
        <MicLineIcon className="h-3 w-3 shrink-0 text-white" muted={!tile.micOn} />
        <span className="truncate text-[11px] font-semibold text-white">{tile.isLocal ? "You" : name}</span>
      </div>
    </div>
  );
}

/**
 * Everyone on stage except the host, as a column of small tiles. Recomputed
 * from the room itself on every track/permission change, so it never shows
 * someone who isn't actually publishing-allowed.
 */
export function StageTiles({ room, hostId, people }: { room: Room | null; hostId: string | null; people: StagePerson[] }) {
  const [tiles, setTiles] = useState<Tile[]>([]);

  useEffect(() => {
    if (!room) return;
    const update = () => setTiles(collectTiles(room, hostId));
    const events = [
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.ParticipantPermissionsChanged,
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
    ] as const;
    events.forEach((e) => room.on(e, update));
    update();
    return () => {
      events.forEach((e) => room.off(e, update));
    };
  }, [room, hostId]);

  if (tiles.length === 0) return null;
  const byId = new Map(people.map((p) => [p.userId, p]));
  return (
    <div className="pointer-events-none absolute right-3 top-28 z-20 flex flex-col gap-2">
      {tiles.map((t) => (
        <VideoTile key={t.identity} tile={t} person={byId.get(t.identity)} />
      ))}
    </div>
  );
}

// ─── People sheet (host + moderators) ────────────────────────────────────

function RoleBadge({ role }: { role: LiveRole }) {
  if (role === "viewer") return null;
  return (
    <span
      className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        role === "host" ? "bg-red/20 text-red-soft" : "bg-blue/20 text-blue"
      }`}
    >
      {role === "host" ? "Host" : "Mod"}
    </span>
  );
}

function SheetButton({
  onClick,
  disabled,
  tone = "ghost",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "ghost";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40 ${
        tone === "primary" ? "bg-red text-white" : "border border-white/20 text-white"
      }`}
    >
      {children}
    </button>
  );
}

export function PeopleSheet({
  liveId,
  state,
  onRefresh,
  onClose,
}: {
  liveId: string;
  state: StageState;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const actions = useStageActions(liveId, onRefresh);
  const isHost = state.role === "host";
  const stageFull = state.onStage.length >= state.maxGuests;
  const watchingOffStage = state.watching.filter((p) => !p.onStage);
  const busy = (userId: string, action: string) => actions.busyKey === `${userId}:${action}`;

  return (
    <BottomSheet onClose={onClose}>
      <div className="max-h-[70vh] overflow-y-auto pb-2">
        <h2 className="mb-4 font-serif text-[24px] leading-tight">People</h2>

        <section className="mb-5">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-ink-3">
            On stage · {state.onStage.length}/{state.maxGuests}
          </p>
          {state.onStage.length === 0 ? (
            <p className="py-2 text-sm text-ink-3">No guests yet. Add someone who&apos;s watching, or approve a request.</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {state.onStage.map((p) => (
                <li key={p.userId} className="flex items-center gap-3 py-2.5">
                  <PersonAvatar person={p} className="h-9 w-9" />
                  <span className="min-w-0 flex-1 truncate text-[15px]">
                    {p.displayName}
                    <RoleBadge role={p.role} />
                  </span>
                  <SheetButton
                    disabled={busy(p.userId, "remove")}
                    onClick={() => actions.onPerson(p.userId, "remove", `${p.displayName} is off the stage.`)}
                  >
                    Remove
                  </SheetButton>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-5">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-ink-3">Requests to join · {state.requests.length}</p>
          {state.requests.length === 0 ? (
            <p className="py-2 text-sm text-ink-3">No one has asked to join yet.</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {state.requests.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <PersonAvatar person={r} className="h-9 w-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px]">{r.displayName}</p>
                    {!r.stillHere && <p className="text-[11px] text-ink-3">Left the Live</p>}
                  </div>
                  <SheetButton
                    disabled={busy(r.userId, "decline")}
                    onClick={() => actions.onPerson(r.userId, "decline")}
                  >
                    Decline
                  </SheetButton>
                  <SheetButton
                    tone="primary"
                    disabled={busy(r.userId, "approve") || !r.stillHere || stageFull}
                    onClick={() => actions.onPerson(r.userId, "approve", `${r.displayName} is joining the Live.`)}
                  >
                    Approve
                  </SheetButton>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-ink-3">Watching · {watchingOffStage.length}</p>
          {watchingOffStage.length === 0 ? (
            <p className="py-2 text-sm text-ink-3">No one else is watching right now. Share your link to bring people in.</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {watchingOffStage.map((p) => {
                const isMod = p.role === "moderator";
                return (
                  <li key={p.userId} className="flex items-center gap-3 py-2.5">
                    <PersonAvatar person={p} className="h-9 w-9" />
                    <span className="min-w-0 flex-1 truncate text-[15px]">
                      {p.displayName}
                      <RoleBadge role={p.role} />
                    </span>
                    {isHost && (
                      <SheetButton
                        disabled={busy(p.userId, isMod ? "remove-moderator" : "make-moderator")}
                        onClick={() =>
                          actions.onPerson(
                            p.userId,
                            isMod ? "remove-moderator" : "make-moderator",
                            isMod ? `${p.displayName} is no longer a moderator.` : `${p.displayName} is now a moderator.`,
                          )
                        }
                      >
                        {isMod ? "Remove mod" : "Make mod"}
                      </SheetButton>
                    )}
                    <SheetButton
                      tone="primary"
                      disabled={busy(p.userId, "invite") || stageFull}
                      onClick={() => actions.onPerson(p.userId, "invite", `${p.displayName} has been added to the Live.`)}
                    >
                      Add to live
                    </SheetButton>
                  </li>
                );
              })}
            </ul>
          )}
          {stageFull && <p className="mt-2 text-[12px] text-amber">The stage is full — remove a guest to add someone else.</p>}
        </section>
      </div>
    </BottomSheet>
  );
}
