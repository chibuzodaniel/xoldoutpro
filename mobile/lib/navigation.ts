import type { NavigatorScreenParams } from "@react-navigation/native";
import type { BottomTabParamList } from "./tabNavigation";

export type RootStackParamList = {
  // NavigatorScreenParams lets a screen outside the Tab.Navigator (e.g. the
  // raised Drop button, rendered as a sibling of it — see BottomTabs.tsx's
  // own comment on why) deep-navigate into a specific tab with params via
  // navigate("Tabs", { screen: "Socials", params: { compose: true } }).
  Tabs: NavigatorScreenParams<BottomTabParamList> | undefined;
  Product: { id: string };
  Creator: { handle: string };
  Event: { id: string };
  Collection: { id: string; name: string };
  Notifications: undefined;
  Group: { id: string; name: string };
  GroupMembers: { id: string; isCreator: boolean };
  Publish: undefined;
  PublishMusic: undefined;
  PublishBeat: undefined;
  PublishMerch: undefined;
  PublishEvent: undefined;
  EditProfile: undefined;
  CatalogMusic: undefined;
  CatalogBeats: undefined;
  CatalogEvents: undefined;
  CatalogMerch: undefined;
  Wallet: undefined;
  PayoutAccounts: undefined;
  Withdraw: undefined;
  Analytics: undefined;
  Player: undefined;
  DiscoverCategory: { type: "RELEASE" | "BEAT" | "EVENT" | "MERCH" };
  TopCreators: undefined;
  Downloaded: undefined;
  HeavyRotation: undefined;
};
