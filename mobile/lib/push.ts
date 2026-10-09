import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import type { User as FirebaseUser } from "firebase/auth";
import { apiPatch, apiPost } from "./api";
import { getOpenConversation, requestMessageCheck } from "./messageNotify";
import { ringBattleInvite } from "./battleInviteBus";

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
//
// Direct messages (explicit ask, 2026-10-05): while the app is open a message
// push doesn't pop its own banner — the in-app message banner shows it
// instead (components/messages/InAppMessageBanner.tsx) — but it still lands
// in the notification tray with sound. A push for the chat already on screen
// is dropped entirely.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const url = (notification.request.content.data as { url?: string } | undefined)?.url;
    // A battle invite while the app is open rings the call screen right away
    // (not on the next 30s poll) — with the push's sound, no banner on top.
    const battleInvite = url?.match(/^\/live\/[^/?#]+\?battleInvite=([^&#]+)/)?.[1];
    if (battleInvite) {
      ringBattleInvite({ inviteId: battleInvite });
      return { shouldShowBanner: false, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true };
    }
    const conversationId = url?.match(/^\/messages\/([^/?#]+)$/)?.[1];
    if (conversationId) {
      const open = conversationId === getOpenConversation();
      if (!open) requestMessageCheck();
      return { shouldShowBanner: false, shouldShowList: !open, shouldPlaySound: !open, shouldSetBadge: true };
    }
    return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true };
  },
});

type PushResult = { ok: true } | { ok: false; error: string };

/** Running inside the Expo Go test app — it can't receive pushes (needs a real EAS build). */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === "storeClient";
}

// One registration per app run, shared by sign-in (AuthContext) and
// PushStatusNotice. Dropped on failure so "Try again" really retries.
let registration: Promise<PushResult> | null = null;

/** Asks for permission if it hasn't been decided yet and registers this phone — once per app run. */
export function ensurePushRegistered(firebaseUser: FirebaseUser): Promise<PushResult> {
  registration ??= enablePush(firebaseUser)
    .catch((): PushResult => ({ ok: false, error: "Could not register this device for push." }))
    .then((result) => {
      if (!result.ok) registration = null;
      return result;
    });
  return registration;
}

export async function enablePush(firebaseUser: FirebaseUser): Promise<PushResult> {
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
