import { createNavigationContainerRef } from "@react-navigation/native";
import { ringBattleInvite } from "./battleInviteBus";
import type { RootStackParamList } from "./navigation";

// Shared state for direct-message notifications on mobile (explicit ask,
// 2026-10-05: "full time push and in app notification"):
//  - navigationRef lets push taps and the in-app banner navigate from
//    outside any screen;
//  - openConversationId is the chat currently on screen, so neither a
//    foreground push nor a banner fires for it;
//  - requestMessageCheck() makes the in-app banner check right away (a push
//    just arrived) instead of waiting for its next poll.

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let openConversationId: string | null = null;
export function setOpenConversation(id: string | null) {
  openConversationId = id;
}
export function getOpenConversation() {
  return openConversationId;
}

const listeners = new Set<() => void>();
export function onMessageCheckRequested(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function requestMessageCheck() {
  listeners.forEach((fn) => fn());
}

/** Opens the screen a notification points at (its web-style url). */
export function openNotificationUrl(url: string | undefined) {
  if (!url || !navigationRef.isReady()) return;
  const m = (re: RegExp) => url.match(re)?.[1];
  // A battle invite push (/live/<id>?battleInvite=<inviteId>) rings instead of opening the Live.
  const battleInvite = m(/^\/live\/[^/?#]+\?battleInvite=([^&#]+)/);
  if (battleInvite) {
    ringBattleInvite({ inviteId: battleInvite });
    return;
  }
  const conversationId = m(/^\/messages\/([^/?#]+)$/);
  const liveId = m(/^\/live\/([^/?#]+)$/);
  const eventId = m(/^\/e\/([^/?#]+)$/);
  const productId = m(/^\/[rbm]\/([^/?#]+)$/);
  const handle = m(/^\/u\/([^/?#]+)$/);
  if (conversationId) navigationRef.navigate("Conversation", { id: conversationId });
  else if (url === "/messages") navigationRef.navigate("Messages");
  else if (liveId) navigationRef.navigate("LiveViewer", { id: liveId });
  else if (url === "/groups/requests") navigationRef.navigate("FanbaseRequests");
  else if (eventId) navigationRef.navigate("Event", { id: eventId });
  else if (productId) navigationRef.navigate("Product", { id: productId });
  else if (handle) navigationRef.navigate("Creator", { handle });
  else navigationRef.navigate("Notifications");
}
