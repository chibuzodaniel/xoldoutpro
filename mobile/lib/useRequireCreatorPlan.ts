import { useEffect } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./navigation";
import { useAuth } from "./AuthContext";

/**
 * Backstop for the four Publish{Music,Beat,Merch,Event}Screen forms — the
 * real gate is PublishScreen's own plan check before it ever navigates
 * here, this just covers any other path that lands directly on one of
 * these screens. Mirrors web's lib/useRequireCreatorPlan.ts.
 */
export function useRequireCreatorPlan() {
  const { appUser, loading } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    if (loading || !appUser) return;
    if (!appUser.creatorPlan) navigation.replace("Publish");
  }, [loading, appUser, navigation]);
}
