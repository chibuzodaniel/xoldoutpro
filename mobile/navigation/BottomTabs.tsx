import { TouchableOpacity, View, StyleSheet } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import type { BottomTabParamList } from "../lib/tabNavigation";
import type { RootStackParamList } from "../lib/navigation";
import { useAuth } from "../lib/AuthContext";
import { colors } from "../lib/theme";
import { DiscoverIcon, SocialsIcon, LibraryIcon, ProfileIcon, PlusIcon } from "../components/NavIcons";
import { MiniPlayer } from "../components/MiniPlayer";
import { HomeScreen } from "../screens/HomeScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { LibraryScreen } from "../screens/LibraryScreen";
import { SocialsScreen } from "../screens/SocialsScreen";

const TAB_BAR_HEIGHT = 60;

const Tab = createBottomTabNavigator<BottomTabParamList>();

// Mirrors web's BottomNav.tsx five-item layout: Discover, Socials, a raised
// "Drop" FAB (opens the Creator Tools publish hub), Library, Profile.
function DropButton() {
  const navigation = useNavigation<NavigationProp<RootStackParamList & BottomTabParamList>>();
  const { appUser } = useAuth();

  return (
    <TouchableOpacity
      style={styles.dropButton}
      onPress={() => navigation.navigate(appUser ? "Publish" : "Profile")}
    >
      <PlusIcon color={colors.ink} />
    </TouchableOpacity>
  );
}

// The Drop tab never actually navigates (tabPress is prevented below) — this
// exists only because Tab.Screen requires a component prop.
function DropPlaceholderScreen() {
  return null;
}

export function BottomTabs() {
  return (
    <View style={styles.container}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.bg,
            borderTopColor: colors.lineSoft,
            height: TAB_BAR_HEIGHT,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: colors.ink3,
          tabBarLabelStyle: { fontSize: 11 },
        }}
      >
        <Tab.Screen
          name="Discover"
          component={HomeScreen}
          options={{ tabBarIcon: ({ color }) => <DiscoverIcon color={color} /> }}
        />
        <Tab.Screen
          name="Socials"
          component={SocialsScreen}
          options={{ tabBarIcon: ({ color }) => <SocialsIcon color={color} /> }}
        />
        <Tab.Screen
          name="Drop"
          component={DropPlaceholderScreen}
          options={{
            tabBarLabel: "Drop",
            tabBarIcon: () => null,
            tabBarButton: () => <DropButton />,
          }}
          listeners={{ tabPress: (e) => e.preventDefault() }}
        />
        <Tab.Screen
          name="Library"
          component={LibraryScreen}
          options={{ tabBarIcon: ({ color }) => <LibraryIcon color={color} /> }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ tabBarIcon: ({ color }) => <ProfileIcon color={color} /> }}
        />
      </Tab.Navigator>

      {/* Overlays right above the tab bar, same fixed-above-nav pattern as
          web's mini-player (see BottomNav.tsx's own comment on this). */}
      <View style={[styles.miniPlayerSlot, { bottom: TAB_BAR_HEIGHT }]} pointerEvents="box-none">
        <MiniPlayer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  miniPlayerSlot: { position: "absolute", left: 0, right: 0 },
  dropButton: {
    position: "absolute",
    top: -22,
    alignSelf: "center",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.red,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
