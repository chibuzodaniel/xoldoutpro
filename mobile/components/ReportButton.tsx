import { useState } from "react";
import { Text, TouchableOpacity, type StyleProp, type TextStyle } from "react-native";
import { useAuth } from "../lib/AuthContext";
import { colors } from "../lib/theme";
import { ReportSheet, type ReportTargetType } from "./ReportSheet";

// In-context reporting, PRD §14: available as an action on any release,
// event, post, or profile. Hidden when signed out or when the viewer owns
// the thing being reported.
export function ReportButton({
  targetType,
  targetId,
  ownerId,
  style,
}: {
  targetType: ReportTargetType;
  targetId: string;
  ownerId?: string;
  style?: StyleProp<TextStyle>;
}) {
  const { appUser } = useAuth();
  const [open, setOpen] = useState(false);

  if (!appUser) return null;
  if (ownerId && ownerId === appUser.id) return null;
  if (targetType === "PROFILE" && targetId === appUser.id) return null;

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)}>
        <Text style={[{ color: colors.ink3, fontSize: 12 }, style]}>Report</Text>
      </TouchableOpacity>
      <ReportSheet visible={open} onClose={() => setOpen(false)} targetType={targetType} targetId={targetId} />
    </>
  );
}
