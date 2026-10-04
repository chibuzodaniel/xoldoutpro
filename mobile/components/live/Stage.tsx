import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { VideoTrack, useTracks } from "@livekit/react-native";
import { Track } from "livekit-client";
import { useAuth } from "../../lib/AuthContext";
import { apiGet, apiPost } from "../../lib/api";
import { colors, fonts } from "../../lib/theme";
import { useToast } from "../ToastProvider";
import { BottomSheet, InitialsAvatar } from "./LiveBits";
import { MicLineIcon } from "./LiveIcons";

// Live co-hosting for mobile — mirrors web's components/live/stage.tsx
// (explicit ask, 2026-10-04; rules in web's lib/live/stage.ts). Who's on
// stage comes from the server's GET /stage view, refreshed whenever the room
// announces a "stage"/"roles" change; video for each guest comes from the
// room's own camera tracks.

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

export type StageEvent = { kind: "stage" | "roles"; type: string; userId: string; displayName?: string; byName?: string };

export function isStageEvent(data: unknown): data is StageEvent {
  const kind = (data as { kind?: unknown } | null)?.kind;
  return kind === "stage" || kind === "roles";
}

export function useStageState(liveId: string) {
  const { firebaseUser } = useAuth();
  const [state, setState] = useState<StageState | null>(null);
  const refresh = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const idToken = await firebaseUser.getIdToken();
      setState(await apiGet<StageState>(`/api/live/${liveId}/stage`, idToken));
    } catch {
      // Keep the last good state — a blip shouldn't empty the lists.
    }
  }, [firebaseUser, liveId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { state, refresh };
}

// apiPost throws "<path> -> <status>" with no body, so map the statuses the
// stage routes use to the same reasons web shows.
function stageErrorMessage(err: unknown, maxGuests: number) {
  const status = err instanceof Error ? Number(err.message.split("-> ")[1]) : NaN;
  if (status === 403) return "Only the host or a moderator can do that.";
  if (status === 404) return "This Live has ended.";
  if (status === 409) return `That didn't work — they may have left, the request was already handled, or the stage is full (up to ${maxGuests} guests).`;
  return "Something went wrong. Try again.";
}

export type PersonAction = "approve" | "decline" | "invite" | "remove" | "make-moderator" | "remove-moderator";

export function useStageActions(liveId: string, onDone: () => void, maxGuests = 3) {
  const { firebaseUser } = useAuth();
  const toast = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function run(key: string, path: string, action: string, success?: string) {
    if (!firebaseUser) return false;
    setBusyKey(key);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPost(path, idToken, { action });
      if (success) toast.success(success);
      return true;
    } catch (err) {
      toast.error(stageErrorMessage(err, maxGuests));
      return false;
    } finally {
      setBusyKey(null);
      onDone();
    }
  }

  return {
    busyKey,
    self: (action: "request" | "cancel" | "leave", success?: string) => run(`self:${action}`, `/api/live/${liveId}/stage`, action, success),
    onPerson: (userId: string, action: PersonAction, success?: string) => run(`${userId}:${action}`, `/api/live/${liveId}/stage/${userId}`, action, success),
  };
}

type StageCellPerson = { userId: string; displayName: string; avatarUrl: string | null };

function StageCell({
  person,
  trackRef,
  isSelf,
  isHost,
  mirror,
  firstRow,
}: {
  person: StageCellPerson;
  trackRef: React.ComponentProps<typeof VideoTrack>["trackRef"] | undefined;
  isSelf: boolean;
  isHost: boolean;
  mirror: boolean;
  firstRow: boolean;
}) {
  const micOn = trackRef?.participant.isMicrophoneEnabled ?? true;
  return (
    <View style={styles.cell}>
      {trackRef ? (
        <VideoTrack trackRef={trackRef} style={StyleSheet.absoluteFill} objectFit="cover" mirror={mirror} />
      ) : (
        <View style={styles.cellAvatar}>
          <InitialsAvatar name={person.displayName || "?"} avatarUrl={person.avatarUrl} size={80} />
        </View>
      )}
      <View style={[styles.cellLabel, { top: firstRow ? 112 : 8 }]}>
        <MicLineIcon size={12} muted={!micOn} />
        <Text style={styles.tileName} numberOfLines={1}>
          {isSelf ? "You" : person.displayName}
        </Text>
        {isHost && (
          <View style={styles.hostTag}>
            <Text style={styles.hostTagText}>HOST</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * Explicit ask, 2026-10-04: "the live should not be like a video call — it
 * should share the screen equally with people in the live". On their own the
 * host fills the screen (the screen's own full-screen video); once anyone
 * else is on stage this covers it with an equal split: 2 people stacked
 * halves, 3 equal rows, 4 a 2×2 grid. Host first, then guests in join order.
 */
export function StageTiles({
  people,
  selfId,
  host,
  mirrorSelf = true,
}: {
  people: StagePerson[];
  selfId: string;
  host: StageCellPerson;
  // The host screen passes false while the back camera is in use.
  mirrorSelf?: boolean;
}) {
  const cameraTracks = useTracks([Track.Source.Camera]);
  if (people.length === 0) return null;
  const everyone: StageCellPerson[] = [host, ...people].slice(0, 4);
  const cell = (p: StageCellPerson, firstRow: boolean) => {
    const isSelf = p.userId === selfId;
    return (
      <StageCell
        key={p.userId}
        person={p}
        trackRef={cameraTracks.find((t) => t.participant.identity === p.userId && !!t.publication) as React.ComponentProps<typeof VideoTrack>["trackRef"] | undefined}
        isSelf={isSelf}
        isHost={p.userId === host.userId}
        mirror={isSelf && mirrorSelf}
        firstRow={firstRow}
      />
    );
  };

  return (
    <View style={styles.grid} pointerEvents="none">
      {everyone.length === 4 ? (
        <>
          <View style={styles.gridRow}>{everyone.slice(0, 2).map((p) => cell(p, true))}</View>
          <View style={styles.gridRow}>{everyone.slice(2).map((p) => cell(p, false))}</View>
        </>
      ) : (
        everyone.map((p, i) => (
          <View key={p.userId} style={styles.gridRow}>
            {cell(p, i === 0)}
          </View>
        ))
      )}
    </View>
  );
}

function RoleBadge({ role }: { role: LiveRole }) {
  if (role === "viewer") return null;
  return (
    <View style={[styles.roleBadge, role === "host" ? styles.roleHost : styles.roleMod]}>
      <Text style={[styles.roleText, { color: role === "host" ? colors.redSoft : colors.blue }]}>{role === "host" ? "HOST" : "MOD"}</Text>
    </View>
  );
}

function SheetButton({ label, onPress, disabled, primary }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.sheetButton, primary ? styles.sheetButtonPrimary : styles.sheetButtonGhost, disabled && { opacity: 0.4 }]}
    >
      <Text style={styles.sheetButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function PersonRow({ person, children }: { person: { displayName: string; avatarUrl: string | null; role?: LiveRole }; children: React.ReactNode }) {
  return (
    <View style={styles.personRow}>
      <InitialsAvatar name={person.displayName || "?"} avatarUrl={person.avatarUrl} size={36} />
      <View style={styles.personName}>
        <Text style={styles.personNameText} numberOfLines={1}>
          {person.displayName}
        </Text>
        {person.role && <RoleBadge role={person.role} />}
      </View>
      {children}
    </View>
  );
}

/** On stage / Requests to join / Watching — for the host and moderators. */
export function PeopleSheet({
  liveId,
  state,
  visible,
  onRefresh,
  onClose,
}: {
  liveId: string;
  state: StageState;
  visible: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const actions = useStageActions(liveId, onRefresh, state.maxGuests);
  const isHost = state.role === "host";
  const stageFull = state.onStage.length >= state.maxGuests;
  const watchingOffStage = state.watching.filter((p) => !p.onStage);
  const busy = (userId: string, action: string) => actions.busyKey === `${userId}:${action}`;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView style={{ maxHeight: 520 }}>
        <Text style={styles.sheetTitle}>People</Text>

        <Text style={styles.sectionLabel}>
          ON STAGE · {state.onStage.length}/{state.maxGuests}
        </Text>
        {state.onStage.length === 0 ? (
          <Text style={styles.emptyText}>No guests yet. Add someone who's watching, or approve a request.</Text>
        ) : (
          state.onStage.map((p) => (
            <PersonRow key={p.userId} person={p}>
              <SheetButton
                label="Remove"
                disabled={busy(p.userId, "remove")}
                onPress={() => actions.onPerson(p.userId, "remove", `${p.displayName} is off the stage.`)}
              />
            </PersonRow>
          ))
        )}

        <Text style={styles.sectionLabel}>REQUESTS TO JOIN · {state.requests.length}</Text>
        {state.requests.length === 0 ? (
          <Text style={styles.emptyText}>No one has asked to join yet.</Text>
        ) : (
          state.requests.map((r) => (
            <PersonRow key={r.id} person={r}>
              <SheetButton label="Decline" disabled={busy(r.userId, "decline")} onPress={() => actions.onPerson(r.userId, "decline")} />
              <SheetButton
                label={r.stillHere ? "Approve" : "Left"}
                primary
                disabled={busy(r.userId, "approve") || !r.stillHere || stageFull}
                onPress={() => actions.onPerson(r.userId, "approve", `${r.displayName} is joining the Live.`)}
              />
            </PersonRow>
          ))
        )}

        <Text style={styles.sectionLabel}>WATCHING · {watchingOffStage.length}</Text>
        {watchingOffStage.length === 0 ? (
          <Text style={styles.emptyText}>No one else is watching right now.</Text>
        ) : (
          watchingOffStage.map((p) => {
            const isMod = p.role === "moderator";
            return (
              <PersonRow key={p.userId} person={p}>
                {isHost && (
                  <SheetButton
                    label={isMod ? "Remove mod" : "Make mod"}
                    disabled={busy(p.userId, isMod ? "remove-moderator" : "make-moderator")}
                    onPress={() =>
                      actions.onPerson(
                        p.userId,
                        isMod ? "remove-moderator" : "make-moderator",
                        isMod ? `${p.displayName} is no longer a moderator.` : `${p.displayName} is now a moderator.`,
                      )
                    }
                  />
                )}
                <SheetButton
                  label="Add"
                  primary
                  disabled={busy(p.userId, "invite") || stageFull}
                  onPress={() => actions.onPerson(p.userId, "invite", `${p.displayName} has been added to the Live.`)}
                />
              </PersonRow>
            );
          })
        )}
        {stageFull && <Text style={styles.fullText}>The stage is full — remove a guest to add someone else.</Text>}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "#000", gap: 1 },
  gridRow: { flex: 1, flexDirection: "row", gap: 1 },
  cell: { flex: 1, overflow: "hidden", backgroundColor: "#140709" },
  cellAvatar: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  cellLabel: {
    position: "absolute",
    right: 8,
    maxWidth: "70%",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  hostTag: { backgroundColor: "#e11d2e", borderRadius: 3, paddingHorizontal: 3 },
  hostTagText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  tileName: { flexShrink: 1, color: "#fff", fontSize: 11, fontWeight: "600" },
  sheetTitle: { color: colors.ink, fontSize: 24, fontFamily: fonts.serif, marginBottom: 12 },
  sectionLabel: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: 14, marginBottom: 4 },
  emptyText: { color: colors.ink3, fontSize: 13, paddingVertical: 6 },
  fullText: { color: colors.amber, fontSize: 12, marginTop: 8 },
  personRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  personName: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  personNameText: { color: colors.ink, fontSize: 15, flexShrink: 1 },
  roleBadge: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  roleHost: { backgroundColor: "rgba(225,29,46,0.2)" },
  roleMod: { backgroundColor: "rgba(91,143,214,0.2)" },
  roleText: { fontSize: 10, fontWeight: "700" },
  sheetButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  sheetButtonPrimary: { backgroundColor: colors.red },
  sheetButtonGhost: { borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  sheetButtonText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
