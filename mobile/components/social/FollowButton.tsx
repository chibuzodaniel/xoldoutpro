import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, StyleSheet } from "react-native";
import { apiDelete, apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { colors } from "../../lib/theme";

export function FollowButton({
  targetUserId,
  compact,
  initialFollowing,
}: {
  targetUserId: string;
  compact?: boolean;
  initialFollowing?: boolean;
}) {
  const { appUser, firebaseUser } = useAuth();
  const [following, setFollowing] = useState<boolean | null>(initialFollowing ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!appUser || !firebaseUser || appUser.id === targetUserId || initialFollowing !== undefined) return;
    firebaseUser
      .getIdToken()
      .then((idToken) => apiGet<{ following: boolean }>(`/api/follow?targetUserId=${targetUserId}`, idToken))
      .then((data) => setFollowing(Boolean(data.following)))
      .catch(() => setFollowing(false));
  }, [appUser, firebaseUser, targetUserId, initialFollowing]);

  if (!appUser || appUser.id === targetUserId) return null;

  async function toggle() {
    if (!firebaseUser) return;
    setBusy(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      if (following) {
        await apiDelete(`/api/follow?targetUserId=${targetUserId}`, idToken);
      } else {
        await apiPost("/api/follow", idToken, { targetUserId });
      }
      setFollowing(!following);
    } catch {
      // best-effort, no toast surface in this component
    } finally {
      setBusy(false);
    }
  }

  return (
    <TouchableOpacity
      onPress={toggle}
      disabled={busy || following === null}
      style={[
        styles.button,
        compact ? styles.buttonCompact : styles.buttonDefault,
        following ? styles.buttonFollowing : styles.buttonNotFollowing,
      ]}
    >
      {busy || following === null ? (
        <ActivityIndicator size="small" color={following ? colors.ink2 : colors.ink} />
      ) : (
        <Text style={[styles.text, following ? styles.textFollowing : styles.textNotFollowing]}>
          {following ? "Following" : "Follow"}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  buttonDefault: { paddingHorizontal: 16, paddingVertical: 7 },
  buttonCompact: { paddingHorizontal: 10, paddingVertical: 4 },
  buttonFollowing: { borderColor: colors.line, backgroundColor: "transparent" },
  buttonNotFollowing: { borderColor: colors.red, backgroundColor: colors.red },
  text: { fontSize: 12, fontWeight: "600" },
  textFollowing: { color: colors.ink2 },
  textNotFollowing: { color: colors.ink },
});
