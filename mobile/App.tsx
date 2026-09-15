import { useEffect } from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { setAudioModeAsync } from "expo-audio";
import type { RootStackParamList } from "./lib/navigation";
import { colors } from "./lib/theme";
import { AuthProvider } from "./lib/AuthContext";
import { PlayerProvider } from "./lib/PlayerContext";
import { BottomTabs } from "./navigation/BottomTabs";
import { ProductScreen } from "./screens/ProductScreen";
import { CreatorScreen } from "./screens/CreatorScreen";
import { EventScreen } from "./screens/EventScreen";
import { CollectionScreen } from "./screens/CollectionScreen";
import { NotificationsScreen } from "./screens/NotificationsScreen";
import { GroupScreen } from "./screens/GroupScreen";
import { GroupMembersScreen } from "./screens/GroupMembersScreen";
import { PublishScreen } from "./screens/PublishScreen";
import { PublishMusicScreen } from "./screens/PublishMusicScreen";
import { PublishBeatScreen } from "./screens/PublishBeatScreen";
import { PublishMerchScreen } from "./screens/PublishMerchScreen";
import { PublishEventScreen } from "./screens/PublishEventScreen";
import { EditProfileScreen } from "./screens/EditProfileScreen";
import { CatalogScreen } from "./screens/CatalogScreen";
import { CatalogEventsScreen } from "./screens/CatalogEventsScreen";
import { CatalogMerchScreen } from "./screens/CatalogMerchScreen";
import { WalletScreen } from "./screens/WalletScreen";
import { PayoutAccountsScreen } from "./screens/PayoutAccountsScreen";
import { WithdrawScreen } from "./screens/WithdrawScreen";
import { AnalyticsScreen } from "./screens/AnalyticsScreen";
import { PlayerScreen } from "./screens/PlayerScreen";
import { DiscoverCategoryScreen } from "./screens/DiscoverCategoryScreen";
import { TopCreatorsScreen } from "./screens/TopCreatorsScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, border: colors.lineSoft },
};

export default function App() {
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  return (
    <AuthProvider>
      <PlayerProvider>
        <NavigationContainer theme={navTheme}>
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
            <Stack.Screen name="CatalogMerch" component={CatalogMerchScreen} options={{ title: "" }} />
            <Stack.Screen name="Wallet" component={WalletScreen} options={{ title: "" }} />
            <Stack.Screen name="PayoutAccounts" component={PayoutAccountsScreen} options={{ title: "" }} />
            <Stack.Screen name="Withdraw" component={WithdrawScreen} options={{ title: "" }} />
            <Stack.Screen name="Analytics" component={AnalyticsScreen} options={{ title: "" }} />
            <Stack.Screen name="Player" component={PlayerScreen} options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="DiscoverCategory" component={DiscoverCategoryScreen} options={{ title: "" }} />
            <Stack.Screen name="TopCreators" component={TopCreatorsScreen} options={{ title: "" }} />
          </Stack.Navigator>
          <StatusBar style="light" />
        </NavigationContainer>
      </PlayerProvider>
    </AuthProvider>
  );
}
