import type { ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

// Same gesture shape as SwipeableTabScreen (bottom-tab navigation), scoped
// down to a screen's own local segmented tabs — e.g. Library's
// Purchased/Collections/Gifts row, Socials' Feed/Fanbase row. Wraps just the
// tab *content* below the tab bar, never the bar itself, so a swipe there
// switches pages without the bar's own touch targets being involved.
export function SwipeableIndexView({
  index,
  count,
  onChangeIndex,
  children,
}: {
  index: number;
  count: number;
  onChangeIndex: (next: number) => void;
  children: ReactNode;
}) {
  function go(next: number) {
    if (next < 0 || next >= count || next === index) return;
    onChangeIndex(next);
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      if (e.translationX < -60 && e.velocityX < 0) {
        runOnJS(go)(index + 1);
      } else if (e.translationX > 60 && e.velocityX > 0) {
        runOnJS(go)(index - 1);
      }
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  );
}
