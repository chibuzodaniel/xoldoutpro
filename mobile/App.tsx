import { useEffect } from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { setAudioModeAsync } from "expo-audio";
import type { RootStackParamList } from "./lib/navigation";
import { colors } from "./lib/theme";
import { AuthProvider } from "./lib/AuthContext";
import { BottomTabs } from "./navigation/BottomTabs";
import { ProductScreen } from "./screens/ProductScreen";
import { CreatorScreen } from "./screens/CreatorScreen";
import { EventScreen } from "./screens/EventScreen";

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
        </Stack.Navigator>
        <StatusBar style="light" />
      </NavigationContainer>
    </AuthProvider>
  );
}
