import { Text } from "react-native";
import { useAuth } from "../lib/AuthContext";
import { colors } from "../lib/theme";

// Mirrors web's components/product/SoldCount.tsx: for an uncapped
// item there's no public "remaining" countdown to show, and the raw sold
// count is only shown to the creator themself, not every visitor.
export function SoldCount({ creatorId, sold }: { creatorId: string; sold: number }) {
  const { appUser } = useAuth();
  if (appUser?.id !== creatorId) return null;

  return <Text style={{ color: colors.ink3, fontSize: 12 }}>{sold} sold</Text>;
}
