import { registerGlobals } from "@livekit/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import type { RootStackParamList } from "./lib/navigation";
import { colors } from "./lib/theme";
import { AuthProvider } from "./lib/AuthContext";
import { PlayerProvider } from "./lib/PlayerContext";
import { ToastProvider } from "./components/ToastProvider";
import { UpdateBanner } from "./components/UpdateBanner";
import { InAppMessageBanner } from "./components/messages/InAppMessageBanner";
import { LiveRoomProvider } from "./lib/LiveRoomContext";
import { MiniLivePlayer } from "./components/live/MiniLivePlayer";
import { BattleInviteRing } from "./components/live/BattleInviteRing";
import { navigationRef, openNotificationUrl } from "./lib/messageNotify";
import { BottomTabs } from "./navigation/BottomTabs";
import { ProductScreen } from "./screens/ProductScreen";
import { CreatorScreen } from "./screens/CreatorScreen";
import { EventScreen } from "./screens/EventScreen";
import { CollectionScreen } from "./screens/CollectionScreen";
import { NotificationsScreen } from "./screens/NotificationsScreen";
import { GroupScreen } from "./screens/GroupScreen";
import { GroupMembersScreen } from "./screens/GroupMembersScreen";
import { FanbaseRequestsScreen } from "./screens/FanbaseRequestsScreen";
import { MessagesScreen } from "./screens/MessagesScreen";
import { ConversationScreen } from "./screens/ConversationScreen";
import { PublishScreen } from "./screens/PublishScreen";
import { PublishMusicScreen } from "./screens/PublishMusicScreen";
import { PublishBeatScreen } from "./screens/PublishBeatScreen";
import { PublishMerchScreen } from "./screens/PublishMerchScreen";
import { PublishEventScreen } from "./screens/PublishEventScreen";
import { EditProfileScreen } from "./screens/EditProfileScreen";
import { CatalogScreen } from "./screens/CatalogScreen";
import { CatalogEventsScreen } from "./screens/CatalogEventsScreen";
import { EventCheckInScreen } from "./screens/EventCheckInScreen";
import { LiveNowScreen } from "./screens/LiveNowScreen";
import { GoLiveScreen } from "./screens/GoLiveScreen";
import { LiveBroadcastScreen } from "./screens/LiveBroadcastScreen";
import { LiveViewerScreen } from "./screens/LiveViewerScreen";
import { LiveCoinsScreen } from "./screens/LiveCoinsScreen";
import { CatalogMerchScreen } from "./screens/CatalogMerchScreen";
import { WalletScreen } from "./screens/WalletScreen";
import { PayoutAccountsScreen } from "./screens/PayoutAccountsScreen";
import { WithdrawScreen } from "./screens/WithdrawScreen";
import { AnalyticsScreen } from "./screens/AnalyticsScreen";
import { PlayerScreen } from "./screens/PlayerScreen";
import { DiscoverCategoryScreen } from "./screens/DiscoverCategoryScreen";
import { TopCreatorsScreen } from "./screens/TopCreatorsScreen";
import { DownloadedScreen } from "./screens/DownloadedScreen";
import { HeavyRotationScreen } from "./screens/HeavyRotationScreen";

// Registers WebRTC globals LiveKit's RN SDK needs (RTCPeerConnection etc.) —
// must run once, before any Xoldout Live screen mounts. Native module, so
// this needs a real EAS dev build (see mobile's own Expo Go native-limits
// note) — wrapped so a plain Expo Go session, which has no native module to
// register, still boots the rest of the app; only the Live screens
// themselves fail (with their own explicit message) if this didn't run.
try {
  registerGlobals();
} catch {
  // No native WebRTC module available (Expo Go) — Live screens handle this.
}

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, border: colors.lineSoft },
};

// Tapping a push (any kind) opens the screen it points at — a chat, a Live,
// the request list, a product… (explicit ask, 2026-10-05). Covers the app
// being opened by the tap too (cold start), once navigation is ready.
function usePushTapNavigation() {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      openNotificationUrl((response.notification.request.content.data as { url?: string } | undefined)?.url);
    });
    return () => sub.remove();
  }, []);
}

function openLaunchNotification() {
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) openNotificationUrl((response.notification.request.content.data as { url?: string } | undefined)?.url);
    })
    .catch(() => {});
}

export default function App() {
  usePushTapNavigation();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <AuthProvider>
      <PlayerProvider>
        <ToastProvider>
        <LiveRoomProvider>
        <UpdateBanner />
        <NavigationContainer theme={navTheme} ref={navigationRef} onReady={openLaunchNotification}>
          <Stack.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.ink,
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen name="Tabs" component={BottomTabs} options={{ headerShown: false }} />
            <Stack.Screen name="Product" component={ProductScreen} options={{ title: "" }} />
            <Stack.Screen name="Creator" component={CreatorScreen} options={{ title: "" }} />
            <Stack.Screen name="Event" component={EventScreen} options={{ title: "" }} />
            <Stack.Screen name="Collection" component={CollectionScreen} options={{ title: "" }} />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen name="Group" component={GroupScreen} options={{ title: "" }} />
            <Stack.Screen name="GroupMembers" component={GroupMembersScreen} options={{ headerShown: false }} />
            <Stack.Screen name="FanbaseRequests" component={FanbaseRequestsScreen} options={{ title: "" }} />
            <Stack.Screen name="Messages" component={MessagesScreen} options={{ title: "" }} />
            <Stack.Screen name="Conversation" component={ConversationScreen} options={{ title: "" }} />
            <Stack.Screen
              name="Publish"
              component={PublishScreen}
              options={{ headerShown: false, presentation: "transparentModal", animation: "slide_from_bottom" }}
            />
            <Stack.Screen name="PublishMusic" component={PublishMusicScreen} options={{ title: "" }} />
            <Stack.Screen name="PublishBeat" component={PublishBeatScreen} options={{ title: "" }} />
            <Stack.Screen name="PublishMerch" component={PublishMerchScreen} options={{ title: "" }} />
            <Stack.Screen name="PublishEvent" component={PublishEventScreen} options={{ title: "" }} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: "" }} />
            <Stack.Screen name="CatalogMusic" component={CatalogScreen} options={{ title: "" }} />
            <Stack.Screen name="CatalogBeats" component={CatalogScreen} options={{ title: "" }} />
            <Stack.Screen name="CatalogEvents" component={CatalogEventsScreen} options={{ title: "" }} />
            <Stack.Screen name="EventCheckIn" component={EventCheckInScreen} options={{ title: "" }} />
            <Stack.Screen name="CatalogMerch" component={CatalogMerchScreen} options={{ title: "" }} />
            <Stack.Screen name="Wallet" component={WalletScreen} options={{ title: "" }} />
            <Stack.Screen name="PayoutAccounts" component={PayoutAccountsScreen} options={{ title: "" }} />
            <Stack.Screen name="Withdraw" component={WithdrawScreen} options={{ title: "" }} />
            <Stack.Screen name="Analytics" component={AnalyticsScreen} options={{ title: "" }} />
            <Stack.Screen name="Player" component={PlayerScreen} options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="DiscoverCategory" component={DiscoverCategoryScreen} options={{ title: "" }} />
            <Stack.Screen name="TopCreators" component={TopCreatorsScreen} options={{ title: "" }} />
            <Stack.Screen name="Downloaded" component={DownloadedScreen} options={{ title: "" }} />
            <Stack.Screen name="HeavyRotation" component={HeavyRotationScreen} options={{ title: "" }} />
            <Stack.Screen name="LiveNow" component={LiveNowScreen} options={{ title: "" }} />
            <Stack.Screen name="GoLive" component={GoLiveScreen} options={{ title: "" }} />
            <Stack.Screen name="LiveBroadcast" component={LiveBroadcastScreen} options={{ headerShown: false }} />
            <Stack.Screen name="LiveViewer" component={LiveViewerScreen} options={{ headerShown: false }} />
            <Stack.Screen name="LiveCoins" component={LiveCoinsScreen} options={{ title: "" }} />
          </Stack.Navigator>
          <StatusBar style="light" />
          <InAppMessageBanner />
        </NavigationContainer>
        {/* A Live the user stepped away from keeps playing here. */}
        <MiniLivePlayer />
        {/* A battle invite ringing. */}
        <BattleInviteRing />
        </LiveRoomProvider>
        </ToastProvider>
      </PlayerProvider>
    </AuthProvider>
    </GestureHandlerRootView>
  );
}
