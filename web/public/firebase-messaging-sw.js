// Firebase Cloud Messaging background handler. Must live at this exact path
// (site root) — the JS SDK's getToken()/onBackgroundMessage() auto-registers
// "/firebase-messaging-sw.js" and there's no way to point it elsewhere from
// the app code. Runs outside the Next.js module system as a plain script, so
// it can't read process.env — these values aren't secrets (Firebase's client
// config is meant to be public), so they're hardcoded here directly.
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBF4E3ujQP_Mub5AcRiU5kkBDejmaf2OJc",
  authDomain: "auth.xoldout.app",
  projectId: "xoldoutpro",
  storageBucket: "xoldoutpro.firebasestorage.app",
  // Derived from the "1:<senderId>:web:..." appId — NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  // isn't set client-side yet, but this is the same value.
  messagingSenderId: "886163264722",
  appId: "1:886163264722:web:1014432e2c7d44127f490b",
});

const messaging = firebase.messaging();

// Reads from `data`, not `notification` — the server (lib/push/send.ts)
// deliberately sends data-only payloads. A `notification` field makes the
// browser auto-display the push itself in the background *in addition to*
// this handler calling showNotification(), doubling every notification.
// Persistent + aggressive by design (explicit ask):
// - requireInteraction: stays on screen until the user clicks or dismisses it
//   (browsers otherwise auto-hide after a few seconds);
// - a tag groups related alerts (one entry per Fanbase/post) and renotify
//   makes a replacement sound/vibrate again instead of updating silently;
// - vibrate + never silent;
// - the unread bell count goes on the installed app's icon.
// Also exposed as self.xoShow so the page can reuse it for pushes that
// arrive while XOLDOUT is open in the foreground (components/push).
function xoShow(data) {
  const { title, body, url, icon, tag, badge } = data ?? {};
  const count = Number(badge);
  if (count > 0 && self.navigator.setAppBadge) self.navigator.setAppBadge(count).catch(() => {});
  return self.registration.showNotification(title ?? "XOLDOUT", {
    body,
    icon: icon || "/xoldout-icon-transparent.png",
    badge: "/xoldout-icon-transparent.png",
    tag: tag || undefined,
    renotify: Boolean(tag),
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200, 100, 300],
    timestamp: Date.now(),
    data: { url },
  });
}

messaging.onBackgroundMessage((payload) => xoShow(payload.data));

// The page posts {type:"xo-show", data} for foreground pushes.
self.addEventListener("message", (event) => {
  if (event.data?.type === "xo-show") event.waitUntil(xoShow(event.data.data));
});

// Focus an already-open XOLDOUT tab and send it to the link, rather than
// stacking up new tabs; only open a new window when none is open.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        if ("navigate" in existing) await existing.navigate(url).catch(() => {});
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
