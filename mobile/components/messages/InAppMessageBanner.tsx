import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, AppState, Platform, StatusBar, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useAuth } from "../../lib/AuthContext";
import { apiGet } from "../../lib/api";
import { colors } from "../../lib/theme";
import { getOpenConversation, navigationRef, onMessageCheckRequested } from "../../lib/messageNotify";
import { Avatar } from "../Avatar";

// Mirrors web's components/messages/InAppMessageBanner.tsx: while the app is
// open, a banner slides down for each new direct message — except for the
// chat on screen or the Messages list. Polls GET /api/messages/latest (works
// in Expo Go too, where push doesn't); a foreground push triggers a check
// straight away via requestMessageCheck().

const POLL_MS = 6_000;
const SHOW_MS = 5_000;
// Rendered outside every screen (no safe-area provider there), so clear the
// status bar / notch directly.
const TOP_OFFSET = Platform.OS === "ios" ? 54 : (StatusBar.currentHeight ?? 24) + 8;

type Incoming = {
  messageId: string;
  conversationId: string;
  sender: { displayName: string; avatarUrl: string | null };
  isRequest: boolean;
  preview: string;
};

export function InAppMessageBanner() {
  const { firebaseUser } = useAuth();
  const [banner, setBanner] = useState<Incoming | null>(null);
  const sinceRef = useRef<string | null>(null);
  const shownRef = useRef(new Set<string>());
  const slide = useRef(new Animated.Value(-120)).current;

  const check = useCallback(async () => {
    if (!firebaseUser || AppState.currentState !== "active") return;
    try {
      const idToken = await firebaseUser.getIdToken();
      const since = sinceRef.current;
      const data = await apiGet<{ messages: Incoming[]; serverTime: string }>(
        `/api/messages/latest${since ? `?since=${encodeURIComponent(since)}` : ""}`,
        idToken,
      );
      const first = sinceRef.current === null;
      sinceRef.current = data.serverTime;
      if (first) return; // starting point only — nothing from before the app opened
      const route = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
      const fresh = data.messages.filter(
        (m) => !shownRef.current.has(m.messageId) && m.conversationId !== getOpenConversation() && route !== "Messages",
      );
      fresh.forEach((m) => shownRef.current.add(m.messageId));
      if (fresh.length > 0) setBanner(fresh[0]);
    } catch {
      // try again next poll
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;
    check();
    const id = setInterval(check, POLL_MS);
    const offCheck = onMessageCheckRequested(check);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") check();
    });
    return () => {
      clearInterval(id);
      offCheck();
      sub.remove();
    };
  }, [firebaseUser, check]);

  useEffect(() => {
    if (!banner) return;
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
    const id = setTimeout(() => {
      Animated.timing(slide, { toValue: -120, duration: 200, useNativeDriver: true }).start(() => setBanner(null));
    }, SHOW_MS);
    return () => clearTimeout(id);
  }, [banner, slide]);

  if (!banner) return null;
  return (
    <Animated.View style={[styles.wrap, { paddingTop: TOP_OFFSET, transform: [{ translateY: slide }] }]} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => {
          const id = banner.conversationId;
          setBanner(null);
          if (navigationRef.isReady()) navigationRef.navigate("Conversation", { id });
        }}
      >
        <Avatar uri={banner.sender.avatarUrl} name={banner.sender.displayName} index={0} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>
            {banner.sender.displayName}
            {banner.isRequest ? <Text style={styles.request}>  Message request</Text> : null}
          </Text>
          <Text style={styles.preview} numberOfLines={1}>
            {banner.preview}
          </Text>
        </View>
        <Text style={styles.open}>Open</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: 10, zIndex: 1000, elevation: 20 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  name: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  request: { color: colors.amber, fontSize: 11, fontWeight: "500" },
  preview: { color: colors.ink2, fontSize: 13, marginTop: 1 },
  open: { color: colors.redSoft, fontSize: 12, fontWeight: "700" },
});
