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
          </Stack.Navigator>
          <StatusBar style="light" />
        </NavigationContainer>
      </PlayerProvider>
    </AuthProvider>
  );
}
