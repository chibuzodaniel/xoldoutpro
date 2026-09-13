import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import type { RootStackParamList } from "./lib/navigation";
import { HomeScreen } from "./screens/HomeScreen";
import { ProductScreen } from "./screens/ProductScreen";
import { CreatorScreen } from "./screens/CreatorScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: "#050505", card: "#050505", border: "#1a1a1a" },
};

export default function App() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: "#050505" },
          headerTintColor: "#fff",
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Product" component={ProductScreen} options={{ title: "" }} />
        <Stack.Screen name="Creator" component={CreatorScreen} options={{ title: "" }} />
      </Stack.Navigator>
      <StatusBar style="light" />
    </NavigationContainer>
  );
}
