export type RootStackParamList = {
  Tabs: undefined;
  Product: { id: string };
  Creator: { handle: string };
  Event: { id: string };
  Collection: { id: string; name: string };
  Notifications: undefined;
  Group: { id: string; name: string };
  GroupMembers: { id: string; isCreator: boolean };
};
