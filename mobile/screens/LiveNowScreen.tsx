import { useEffect } from "react";
import { Text, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { LiveNowPanel } from "../components/live/LiveNowPanel";

// Discover's entry point into Live — mirrors web's app/(app)/live/page.tsx.
// Content itself is shared with Socials' own "Go Live" tab via LiveNowPanel;
// this screen only adds the stack header (back button, title, XG balance
// link) that a swiped-in tab doesn't have.
export function LiveNowScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    navigation.setOptions({
      title: "Live",
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate("LiveCoins")}>
          <Text style={{ color: colors.amber, fontSize: 13, fontWeight: "600" }}>XG balance</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  return <LiveNowPanel />;
}
