import { useEffect, useState } from "react";
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation, useNavigationState, type NavigationProp } from "@react-navigation/native";
import type { BottomTabParamList } from "../lib/tabNavigation";
import type { RootStackParamList } from "../lib/navigation";
import { useAuth } from "../lib/AuthContext";
import { apiGet, apiPost } from "../lib/api";
import { colors } from "../lib/theme";
import { DiscoverIcon, SocialsIcon, LibraryIcon, ProfileIcon, PlusIcon, ComposeIcon } from "../components/NavIcons";
import { MiniPlayer } from "../components/MiniPlayer";
import { SwipeableTabScreen } from "../components/SwipeableTabScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { LibraryScreen } from "../screens/LibraryScreen";
import { SocialsScreen } from "../screens/SocialsScreen";

const TAB_BAR_HEIGHT = 60;
const UNREAD_POLL_MS = 45000;

const Tab = createBottomTabNavigator<BottomTabParamList>();

// One per swipeable tab, not an inline arrow function — React Navigation
// requires a stable component reference for `component`, and an inline
// function there would remount the screen (losing scroll position/state)
// on every render of BottomTabs.
function SwipeableDiscover() {
  return (
    <SwipeableTabScreen tab="Discover">
      <HomeScreen />
    </SwipeableTabScreen>
  );
}
function SwipeableSocials() {
  return (
    <SwipeableTabScreen tab="Socials">
      <SocialsScreen />
    </SwipeableTabScreen>
  );
}
function SwipeableLibrary() {
  return (
    <SwipeableTabScreen tab="Library">
      <LibraryScreen />
    </SwipeableTabScreen>
  );
}
function SwipeableProfile() {
  return (
    <SwipeableTabScreen tab="Profile">
      <ProfileScreen />
    </SwipeableTabScreen>
  );
}

// Mirrors web's BottomNav.tsx unread-badge polling (lib/socials/unread.ts on
// web) — separate signal from push notifications. Paused while already on
// Socials, where the mark-read effect below takes over instead.
function useUnreadSocialsCount(activeTab: string | undefined) {
  const { appUser, firebaseUser } = useAuth();
  const [count, setCount] = useState(0);
  const onSocials = activeTab === "Socials";

  useEffect(() => {
    if (!appUser || !firebaseUser || onSocials) return;
    let cancelled = false;
    async function poll() {
      try {
        const idToken = await firebaseUser!.getIdToken();
        const data = await apiGet<{ count: number }>("/api/socials/unread", idToken);
        if (!cancelled) setCount(data.count);
      } catch {
        // Transient failure — next poll tick will retry.
      }
    }
    poll();
    const interval = setInterval(poll, UNREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [appUser, firebaseUser, onSocials]);

  // Zeroes the badge as soon as Socials opens, rather than waiting for the
  // next poll — mirrors web's own mark-read-on-open effect.
  useEffect(() => {
    if (!appUser || !firebaseUser || !onSocials) return;
    firebaseUser
      .getIdToken()
      .then((idToken) => apiPost("/api/socials/unread", idToken))
      .then(() => setCount(0))
      .catch(() => {});
  }, [appUser, firebaseUser, onSocials]);

  return count;
}

// Mirrors web's BottomNav.tsx five-item layout: Discover, Socials, a raised
// "Drop" FAB (opens the Creator Tools publish hub — or composes a post
// directly when already on Socials, same as web's `?compose=1`, swapping
// both its icon to a pencil and its label to "Post"), Library, Profile.
// Every tab shows a text label below its icon, so the FAB gets one too
// rather than being a silent bare "+" (same reasoning as web's own comment
// on this).
//
// Rendered as a sibling of MiniPlayer (see BottomTabs below), not via
// tabBarButton inside the Tab.Navigator itself, so `activeTab` is passed in
// as a prop rather than read via useNavigationState — that hook resolves to
// the nearest ancestor navigator's state, which from outside the
// Tab.Navigator would be the root Stack's, not the tab bar's.
function DropButton({ activeTab }: { activeTab: string | undefined }) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { appUser } = useAuth();
  const onSocials = activeTab === "Socials";

  function handlePress() {
    if (!appUser) {
      navigation.navigate("Tabs", { screen: "Profile" });
      return;
    }
    if (onSocials) navigation.navigate("Tabs", { screen: "Socials", params: { compose: true } });
    else navigation.navigate("Publish");
  }

  // Button and label stack in normal flow with a small gap between them
  // (mirrors web's flex-col gap-1) — the whole group is what floats above
  // the tab bar, via dropOverlay's own `bottom` offset below, not the
  // button alone. Pinning the label to a fixed baseline shared with the
  // other four tabs (tried first) left an oversized gap under the button;
  // this keeps the button-to-label spacing consistent with every other tab
  // instead.
  return (
    <TouchableOpacity style={styles.dropWrap} onPress={handlePress} hitSlop={{ top: 12, bottom: 12, left: 20, right: 20 }}>
      <View style={styles.dropButton}>
        {onSocials ? <ComposeIcon color={colors.ink} /> : <PlusIcon color={colors.ink} />}
      </View>
      <Text style={styles.dropLabel}>{onSocials ? "Post" : "Drop"}</Text>
    </TouchableOpacity>
  );
}

// The Drop tab never actually navigates (tabPress is prevented below) — this
// exists only because Tab.Screen requires a component prop.
function DropPlaceholderScreen() {
  return null;
}

// Renders nothing — exists purely to read the Tab.Navigator's own active
// route from inside its tree (useNavigationState only resolves to the
// nearest ancestor navigator) and report it up to BottomTabs, which passes
// it down to the externally-rendered DropButton. See that component's and
// its tabBarButton call site's comments for why DropButton can't just call
// useNavigationState itself.
function ActiveTabTracker({ onChange }: { onChange: (name: string | undefined) => void }) {
  const activeTab = useNavigationState((state) => state.routes[state.index]?.name);
  useEffect(() => {
    onChange(activeTab);
  }, [activeTab, onChange]);
  return null;
}

function SocialsTabIcon({ color }: { color: string }) {
  const activeTab = useNavigationState((state) => state.routes[state.index]?.name);
  const count = useUnreadSocialsCount(activeTab);
  return (
    <View>
      <SocialsIcon color={color} />
      {count > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{count > 9 ? "9+" : count}</Text>
        </View>
      )}
    </View>
  );
}

export function BottomTabs() {
  // Lifted up here (rather than read via useNavigationState inside
  // DropButton) because DropButton itself now renders outside the
  // Tab.Navigator's own tree — see its comment. ActiveTabTracker below runs
  // useNavigationState from inside the tab bar (where that hook actually
  // resolves to the tab state) and reports back up through this setter.
  const [activeTab, setActiveTab] = useState<string | undefined>("Discover");

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
          component={SwipeableDiscover}
          options={{ tabBarIcon: ({ color }) => <DiscoverIcon color={color} /> }}
        />
        <Tab.Screen
          name="Socials"
          component={SwipeableSocials}
          options={{ tabBarIcon: ({ color }) => <SocialsTabIcon color={color} /> }}
        />
        <Tab.Screen
          name="Drop"
          component={DropPlaceholderScreen}
          // Renders no visible button here (see below) — the tab row still
          // reserves this slot's flex width, keeping the other four evenly
          // spaced, but the actual raised button is drawn separately as a
          // sibling of MiniPlayer further down so it can paint on top of it
          // (see that comment for why tabBarButton couldn't stay here).
          // ActiveTabTracker piggybacks on this same empty slot purely to
          // read the tab state from inside the Tab.Navigator's own tree.
          options={{ tabBarLabel: "Drop", tabBarIcon: () => null, tabBarButton: () => <ActiveTabTracker onChange={setActiveTab} /> }}
          listeners={{ tabPress: (e) => e.preventDefault() }}
        />
        <Tab.Screen
          name="Library"
          component={SwipeableLibrary}
          options={{ tabBarIcon: ({ color }) => <LibraryIcon color={color} /> }}
        />
        <Tab.Screen
          name="Profile"
          component={SwipeableProfile}
          options={{ tabBarIcon: ({ color }) => <ProfileIcon color={color} /> }}
        />
      </Tab.Navigator>

      {/* Overlays right above the tab bar, same fixed-above-nav pattern as
          web's mini-player (see BottomNav.tsx's own comment on this). */}
      <View style={[styles.miniPlayerSlot, { bottom: TAB_BAR_HEIGHT }]} pointerEvents="box-none">
        <MiniPlayer />
      </View>

      {/* Drawn after (so painted on top of) MiniPlayer above, not as part of
          the Tab.Navigator's own tab bar — react-native has no reliable
          cross-subtree z-index, so the only way to guarantee this raised
          button's top half (which pokes up into MiniPlayer's own space)
          isn't painted over by MiniPlayer's opaque background is same-parent
          JSX order, not a style prop. */}
      <View style={styles.dropOverlay} pointerEvents="box-none">
        <DropButton activeTab={activeTab} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  miniPlayerSlot: { position: "absolute", left: 0, right: 0, zIndex: 5, elevation: 5 },
  // No fixed height — sizes to its content (button + gap + label) and grows
  // upward from this `bottom` anchor, same as a normal flex column would.
  // Explicit ask, 2026-09-19: the original 20 raised the button/label enough
  // that "Drop" sat well above the other four tabs' labels instead of
  // reading as part of the same row — 8 keeps a slight raise (still reads as
  // a FAB) while landing the label much closer to the other tabs' baseline.
  dropOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 8,
    alignItems: "center",
    zIndex: 10,
    elevation: 10,
  },
  dropWrap: { alignItems: "center" },
  dropLabel: { fontSize: 11, color: colors.ink3, marginTop: 4 },
  unreadBadge: {
    position: "absolute",
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: { color: colors.ink, fontSize: 9, fontWeight: "700" },
  dropButton: {
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
