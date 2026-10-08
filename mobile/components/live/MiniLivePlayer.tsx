import { useMemo, useRef, useState } from "react";
import { Alert, Animated, Dimensions, PanResponder, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { VideoTrack, useTracks } from "@livekit/react-native";
import { Track } from "livekit-client";
import { useAuth } from "../../lib/AuthContext";
import { apiPost } from "../../lib/api";
import { useLiveRoom } from "../../lib/LiveRoomContext";
import { navigationRef } from "../../lib/messageNotify";
import { colors } from "../../lib/theme";
import { useToast } from "../ToastProvider";
import { InitialsAvatar } from "./LiveBits";

// The floating, draggable mini Live player (explicit ask, 2026-10-08) —
// mirrors web's components/live/LiveDock.tsx. Shown on every screen while
// a Live is connected (lib/LiveRoomContext.tsx) but its own screen isn't
// open: the host's camera (the host sees their own), the Live's sound keeps
// playing, tap to go back to the full Live, × to leave — or, for the host,
// to end the Live.

const W = 112;
const H = 176;
const EDGE = 12;

export function MiniLivePlayer() {
  const { active, visibleLiveId } = useLiveRoom();
  if (!active || visibleLiveId === active.liveId) return null;
  return <Player key={active.liveId} />;
}

function Player() {
  const { active, stop } = useLiveRoom();
  const { firebaseUser } = useAuth();
  const toast = useToast();
  const tracks = useTracks([Track.Source.Camera]);
  const [ending, setEnding] = useState(false);
  const screen = Dimensions.get("window");
  const pos = useRef(new Animated.ValueXY({ x: screen.width - W - EDGE, y: screen.height - H - 120 })).current;
  const last = useRef({ x: screen.width - W - EDGE, y: screen.height - H - 120 });

  const live = active!;
  const hostTrack =
    live.role === "host" ? tracks.find((t) => t.participant.isLocal) : tracks.find((t) => t.participant.identity === live.join.hostId);
  const hostName = live.role === "host" ? "You're live" : (live.join.session?.creator.displayName ?? "Live");

  function open() {
    if (!navigationRef.isReady()) return;
    if (live.role === "host") navigationRef.navigate("LiveBroadcast", { id: live.liveId });
    else navigationRef.navigate("LiveViewer", { id: live.liveId });
  }

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onPanResponderMove: (_e, g) => {
          pos.setValue({ x: last.current.x + g.dx, y: last.current.y + g.dy });
        },
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dx) + Math.abs(g.dy) < 6) {
            open();
            return;
          }
          const { width, height } = Dimensions.get("window");
          const y = Math.min(Math.max(EDGE + 40, last.current.y + g.dy), height - H - EDGE - 40);
          // Snap to the nearer side, like a phone's picture-in-picture.
          const x = last.current.x + g.dx + W / 2 < width / 2 ? EDGE : width - W - EDGE;
          last.current = { x, y };
          Animated.spring(pos, { toValue: { x, y }, useNativeDriver: false, friction: 7 }).start();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function close() {
    if (live.role === "viewer") return stop();
    Alert.alert("End your Live?", "It ends for everyone watching.", [
      { text: "Keep going", style: "cancel" },
      {
        text: "End Live",
        style: "destructive",
        onPress: async () => {
          setEnding(true);
          try {
            if (firebaseUser) {
              const data = await apiPost<{ summary: Parameters<typeof toast.liveSummary>[0] }>(`/api/live/${live.liveId}/end`, await firebaseUser.getIdToken());
              toast.liveSummary(data.summary);
            }
          } catch {
            toast.error("Could not end your Live");
          } finally {
            stop();
          }
        },
      },
    ]);
  }

  return (
    <Animated.View style={[styles.wrap, { transform: pos.getTranslateTransform() }]} {...pan.panHandlers}>
      {hostTrack ? (
        <VideoTrack trackRef={hostTrack} style={StyleSheet.absoluteFill} objectFit="cover" mirror={live.role === "host"} />
      ) : (
        <View style={styles.fallback}>
          <InitialsAvatar name={live.join.session?.creator.displayName ?? "?"} avatarUrl={live.join.session?.creator.avatarUrl} size={56} />
        </View>
      )}
      <View style={styles.badge}>
        <View style={styles.dot} />
        <Text style={styles.badgeText}>LIVE</Text>
      </View>
      <TouchableOpacity
        style={styles.close}
        onPress={close}
        disabled={ending}
        hitSlop={8}
        accessibilityLabel={live.role === "host" ? "End your Live" : "Leave this Live"}
      >
        <Text style={styles.closeText}>×</Text>
      </TouchableOpacity>
      <Text style={styles.name} numberOfLines={1}>
        {hostName}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    top: 0,
    width: W,
    height: H,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#2a0f45",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    zIndex: 1000,
  },
  fallback: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    left: 6,
    top: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.red,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#fff" },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  close: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { color: "#fff", fontSize: 16, lineHeight: 18 },
  name: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingBottom: 6,
    paddingTop: 14,
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
});
