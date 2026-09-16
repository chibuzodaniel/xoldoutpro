import type { ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import type { BottomTabParamList } from "../lib/tabNavigation";

// The order swiping moves through — "Drop" is the center FAB shortcut, not
// a real screen, so it's excluded here even though it's a tab.
const SWIPE_TAB_ORDER: (keyof BottomTabParamList)[] = ["Discover", "Socials", "Library", "Profile"];

// Wraps a tab screen's content (not the tab bar itself, which lives outside
// each screen's own tree) so a decisive horizontal swipe moves to the
// adjacent tab — activeOffsetX/failOffsetY hand the gesture back to any
// vertical ScrollView/FlatList inside immediately if the drag isn't
// primarily horizontal, so normal scrolling is never hijacked.
export function SwipeableTabScreen({ tab, children }: { tab: keyof BottomTabParamList; children: ReactNode }) {
  const navigation = useNavigation<NavigationProp<BottomTabParamList>>();
  const currentIndex = SWIPE_TAB_ORDER.indexOf(tab);

  function goToIndex(index: number) {
    if (index < 0 || index >= SWIPE_TAB_ORDER.length || index === currentIndex) return;
    navigation.navigate(SWIPE_TAB_ORDER[index]);
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      if (e.translationX < -60 && e.velocityX < 0) {
        runOnJS(goToIndex)(currentIndex + 1);
      } else if (e.translationX > 60 && e.velocityX > 0) {
        runOnJS(goToIndex)(currentIndex - 1);
      }
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  );
}
