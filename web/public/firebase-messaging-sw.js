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

messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification ?? {};
  self.registration.showNotification(title ?? "XOLDOUT", {
    body,
    icon: icon ?? "/xoldout-icon-transparent.png",
    data: payload.data,
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(self.clients.openWindow(url));
});
