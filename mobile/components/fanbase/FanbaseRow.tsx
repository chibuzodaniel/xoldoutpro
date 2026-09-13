import type { ReactNode } from "react";
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import type { FanbaseGroup } from "../../lib/fanbaseTypes";
import type { RootStackParamList } from "../../lib/navigation";
import { colors } from "../../lib/theme";
import { Avatar } from "../Avatar";

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// `preview` switches to the chat-list layout (last message + sender, unread
// count) for rows where the viewer is already a member — Discover has no
// thread to preview, so it keeps the plain subtitle+action layout instead.
export function FanbaseRow({
  group,
  index,
  subtitle,
  action,
  preview = false,
}: {
  group: FanbaseGroup;
  index: number;
  subtitle: string;
  action?: ReactNode;
  preview?: boolean;
}) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  return (
    <TouchableOpacity style={styles.row} onPress={() => navigation.navigate("Group", { id: group.id, name: group.name })}>
      <View style={styles.avatarWrap}>
        <Avatar uri={group.coverImageUrl} name={group.name} index={index} size={48} />
        {group.visibility === "REQUEST_TO_JOIN" && (
          <View style={styles.lockBadge}>
            <Text style={styles.lockBadgeText}>🔒</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {group.name}
          </Text>
          {preview && group.lastActivityAt && <Text style={styles.time}>{timeAgo(group.lastActivityAt)}</Text>}
        </View>
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle} numberOfLines={1}>
            {preview && group.lastMessage ? `${group.lastMessage.senderName}: ${group.lastMessage.body}` : subtitle}
          </Text>
          {preview && group.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{group.unreadCount > 99 ? "99+" : group.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
      {action}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  avatarWrap: { position: "relative" },
  lockBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  lockBadgeText: { fontSize: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { color: colors.ink, fontSize: 14, fontWeight: "600", flexShrink: 1 },
  time: { color: colors.ink3, fontSize: 11 },
  subtitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 },
  subtitle: { color: colors.ink3, fontSize: 12, flex: 1 },
  unreadBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.red, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  unreadBadgeText: { color: colors.ink, fontSize: 10, fontWeight: "700" },
});
