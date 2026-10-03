import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import type { User as FirebaseUser } from "firebase/auth";
import { apiPatch, apiPost } from "./api";

// Mirrors web's lib/push.ts (same PATCH /api/me {pushEnabled, fcmTokens}
// shape — the field is a plain string[] with no platform tag, holding FCM
// tokens from web and Expo push tokens from here side by side; see web's
// lib/push/send.ts for how each format gets routed to the right send API).
//
// Deliberately uses Expo's own push service (getExpoPushTokenAsync) rather
// than native Firebase Messaging: this app has no native Firebase config
// (google-services.json / GoogleService-Info.plist — mobile/lib/firebase.ts
// only ever used the JS SDK, for Auth), and standing that up just for push
// would mean a heavier native dependency and its own rebuild. Expo's
// service needs an EAS project id (app.json's extra.eas.projectId, or an
// EXPO_PUBLIC_EAS_PROJECT_ID env fallback) — until one exists this throws
// a clear error rather than a cryptic native one.
function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  );
}

// Aggressive by design (explicit ask): even while the app is open, show the
// banner, play the sound and update the app-icon unread badge.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function enablePush(firebaseUser: FirebaseUser): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = projectId();
  if (!id) return { ok: false, error: "Push isn't configured for this build yet." };

  if (Platform.OS === "android") {
    // The channel the server sends on (web's lib/push/send.ts ANDROID_CHANNEL_ID
    // = "alerts"). HIGH importance = heads-up banner over whatever's on
    // screen, with sound and vibration; shown on the lock screen too.
    // (Android fixes a channel's importance once created, so this is a new
    // channel rather than upgrading the old "default" one.)
    await Notifications.setNotificationChannelAsync("alerts", {
      name: "XOLDOUT alerts",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 150, 250, 150, 400],
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return { ok: false, error: "Notification permission was denied." };

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    const idToken = await firebaseUser.getIdToken();
    // Adds this phone to the account's device list (keeps web/other devices
    // registered). Falls back to the old replace-the-list PATCH only when the
    // API is an older deploy without /api/me/push-devices.
    try {
      await apiPost("/api/me/push-devices", idToken, { token });
    } catch (e) {
      if (!(e instanceof Error && e.message.includes("-> 404"))) throw e;
      await apiPatch("/api/me", idToken, { pushEnabled: true, fcmTokens: [token] });
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not register this device for push." };
  }
}
