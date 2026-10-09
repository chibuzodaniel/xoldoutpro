import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Platform, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import * as Notifications from "expo-notifications";
import { useAuth } from "../lib/AuthContext";
import { ensurePushRegistered, isExpoGo } from "../lib/push";
import { colors } from "../lib/theme";

// Mirrors web's components/push/PushStatusNotice.tsx (explicit ask,
// 2026-10-09): push has no toggle, so when this phone isn't registered —
// permission blocked, never asked, or Expo Go — say so and offer the one
// thing that fixes it. Shows nothing once it's working (unless showWhenOn).

type Status = { kind: "checking" | "on" | "off" | "blocked" | "expo-go" } | { kind: "error"; error: string };

export function PushStatusNotice({ showWhenOn = false, style }: { showWhenOn?: boolean; style?: StyleProp<ViewStyle> }) {
  const { firebaseUser } = useAuth();
  const [status, setStatus] = useState<Status>({ kind: "checking" });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!firebaseUser) return;
    if (isExpoGo()) return setStatus({ kind: "expo-go" });
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status === "granted") {
      const result = await ensurePushRegistered(firebaseUser);
      return setStatus(result.ok ? { kind: "on" } : { kind: "error", error: result.error });
    }
    setStatus({ kind: permission.canAskAgain ? "off" : "blocked" });
  }, [firebaseUser]);

  useEffect(() => {
    void refresh();
    // Back from the phone's Settings — pick up the change.
    const sub = AppState.addEventListener("change", (state) => state === "active" && void refresh());
    return () => sub.remove();
  }, [refresh]);

  async function turnOn() {
    if (!firebaseUser) return;
    setBusy(true);
    try {
      await ensurePushRegistered(firebaseUser);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status.kind === "checking") return null;
  if (status.kind === "on") {
    if (!showWhenOn) return null;
    return (
      <View style={[styles.box, style]}>
        <Text style={styles.onTitle}>✓ Notifications are on for this phone</Text>
        <Text style={styles.body}>Sales, messages, Lives and more — even when XOLDOUT is closed.</Text>
      </View>
    );
  }

  const settingsPath = Platform.OS === "ios" ? "Settings → Notifications → XOLDOUT" : "Settings → Apps → XOLDOUT → Notifications";
  const copy = {
    off: { title: "Notifications are off on this phone", body: "Turn them on to hear about sales, messages and Lives even when XOLDOUT is closed." },
    blocked: { title: "Notifications are blocked on this phone", body: `Allow them in ${settingsPath}, then come back here.` },
    "expo-go": { title: "No notifications in the test app", body: "Expo Go can't receive push notifications — install the real XOLDOUT app to get them." },
    error: { title: "Couldn't turn on notifications", body: status.kind === "error" ? status.error : "" },
  }[status.kind];
  const action =
    status.kind === "off" ? { label: busy ? "Turning on…" : "Turn on", onPress: turnOn }
    : status.kind === "error" ? { label: busy ? "Trying…" : "Try again", onPress: turnOn }
    : status.kind === "blocked" ? { label: "Open Settings", onPress: () => void Linking.openSettings() }
    : null;

  return (
    <View style={[styles.box, styles.warn, style]}>
      <Text style={styles.title}>🔕 {copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      {action && (
        <TouchableOpacity onPress={action.onPress} disabled={busy} style={[styles.button, busy && { opacity: 0.5 }]}>
          <Text style={styles.buttonText}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 14 },
  warn: { borderColor: "rgba(217,154,43,0.4)", backgroundColor: "rgba(217,154,43,0.1)" },
  title: { color: colors.amber, fontWeight: "700", fontSize: 14 },
  onTitle: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  body: { color: colors.ink2, fontSize: 12, marginTop: 4, lineHeight: 17 },
  button: { alignSelf: "flex-start", marginTop: 12, backgroundColor: colors.red, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
