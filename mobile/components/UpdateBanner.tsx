import { useEffect, useState } from "react";
import { Linking, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { colors } from "../lib/theme";
import { apiGet } from "../lib/api";

const DISMISSED_KEY = "update-banner-dismissed-build";

type VersionResponse = { version: string | null; buildNumber: number | null; url: string | null };

// Global, mounted once in App.tsx like ToastProvider — persistent (unlike
// ToastProvider's 2.5s auto-dismiss) since "a new build exists" isn't a
// transient event the user should have to catch in time. There's no Play
// Store here (sideloaded APK distribution — see mobile/scripts/
// publish-apk.mjs), so this poll-and-banner is the only update signal the
// app gets.
export function UpdateBanner() {
  const [remote, setRemote] = useState<VersionResponse | null>(null);
  const [dismissedBuild, setDismissedBuild] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, dismissed] = await Promise.all([
          apiGet<VersionResponse>("/api/mobile/version"),
          AsyncStorage.getItem(DISMISSED_KEY),
        ]);
        if (cancelled) return;
        setRemote(data);
        setDismissedBuild(dismissed ? Number(dismissed) : null);
      } catch {
        // Offline or the endpoint is briefly down — not worth surfacing to
        // the user, the check just retries next app launch.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const localBuild = (Constants.expoConfig?.extra?.buildNumber as number | undefined) ?? 0;
  const shouldShow =
    remote?.buildNumber != null && remote.url && remote.buildNumber > localBuild && remote.buildNumber !== dismissedBuild;

  if (!shouldShow) return null;

  async function dismiss() {
    setDismissedBuild(remote!.buildNumber);
    await AsyncStorage.setItem(DISMISSED_KEY, String(remote!.buildNumber));
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>
        {remote?.version ? `XOLDOUT ${remote.version} is available` : "A new update is available"}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => Linking.openURL(remote!.url!)}>
          <Text style={styles.update}>Update</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={dismiss}>
          <Text style={styles.dismiss}>Later</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface2,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  text: { color: colors.ink, fontSize: 12, fontWeight: "600", flex: 1, marginRight: 12 },
  actions: { flexDirection: "row", gap: 16 },
  update: { color: colors.redSoft, fontSize: 12, fontWeight: "700" },
  dismiss: { color: colors.ink3, fontSize: 12, fontWeight: "600" },
});
