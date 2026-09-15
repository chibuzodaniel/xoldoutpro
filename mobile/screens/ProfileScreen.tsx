import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../lib/AuthContext";
import { friendlyFirebaseError } from "../lib/friendlyFirebaseError";
import { apiGet } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";
import type { MeStats } from "../lib/walletTypes";
import { colors, fonts } from "../lib/theme";
import { Avatar } from "../components/Avatar";
import { VerifiedBadge, primaryBadgeType } from "../components/VerifiedBadge";

const CATALOG_ROWS = [
  { key: "music" as const, label: "Music releases", screen: "CatalogMusic" as const },
  { key: "beats" as const, label: "Beats & packs", screen: "CatalogBeats" as const },
  { key: "events" as const, label: "Events", screen: "CatalogEvents" as const },
  { key: "merch" as const, label: "Merchandise", screen: "CatalogMerch" as const },
];

function SignedInView() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { appUser, firebaseUser } = useAuth();
  const [stats, setStats] = useState<MeStats | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser.getIdToken().then((idToken) => apiGet<MeStats>("/api/me/stats", idToken).then(setStats).catch(() => {}));
  }, [firebaseUser]);

  if (!appUser) return null;

  return (
    <View>
      {appUser.coverUrl ? (
        <Image source={{ uri: appUser.coverUrl }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]} />
      )}

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.avatarWrap}>
            <Avatar uri={appUser.avatarUrl} name={appUser.displayName} index={0} size={72} />
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate("Analytics")}>
              <Text style={styles.iconButtonText}>Insights</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate("Wallet")}>
              <Text style={styles.iconButtonText}>Wallet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingsButton} onPress={() => navigation.navigate("EditProfile")}>
              <Text style={styles.settingsIcon}>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.nameRow}>
          <Text style={styles.name}>{appUser.displayName}</Text>
          {appUser.isVerified && <VerifiedBadge size={16} badgeType={primaryBadgeType(appUser.verificationBadges)} />}
        </View>
        <Text style={styles.handle}>@{appUser.handle}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats?.fans ?? "—"}</Text>
            <Text style={styles.statLabel}>Fans</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats?.sales ?? "—"}</Text>
            <Text style={styles.statLabel}>Sales</Text>
          </View>
        </View>

        {appUser.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {appUser.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {appUser.bio && <Text style={styles.bio}>{appUser.bio}</Text>}

        <Text style={styles.sectionTitle}>Your Catalog</Text>
        <View style={styles.catalogList}>
          {CATALOG_ROWS.map((row) => (
            <TouchableOpacity key={row.key} style={styles.catalogRow} onPress={() => navigation.navigate(row.screen)}>
              <Text style={styles.catalogLabel}>{row.label}</Text>
              <Text style={styles.catalogCount}>{stats?.catalog[row.key] ?? 0}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={() => navigation.navigate("EditProfile")}>
          <Text style={styles.logoutButtonText}>Settings & account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SignedOutView() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email, password);
      else await signup(email, password);
    } catch (e) {
      setError(friendlyFirebaseError(e, mode === "login" ? "Log in failed" : "Sign up failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.authContent}>
      <Text style={styles.eyebrow}>{mode === "login" ? "Welcome back" : "Create an account"}</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.ink3}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.ink3}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />

      {error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <Text style={styles.primaryButtonText}>{mode === "login" ? "Log in" : "Sign up"}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.switchModeButton}
        onPress={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError(null);
        }}
      >
        <Text style={styles.switchModeText}>
          {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

export function ProfileScreen() {
  const { appUser, loading } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.ink} />
          </View>
        ) : appUser ? (
          <SignedInView />
        ) : (
          <SignedOutView />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  authContent: { flex: 1, padding: 20, justifyContent: "center" },
  eyebrow: { color: colors.red, fontSize: 12, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", marginBottom: 24 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.ink,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 14,
  },
  errorText: { color: colors.redSoft, fontSize: 13, marginBottom: 12 },
  primaryButton: { backgroundColor: colors.red, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  primaryButtonText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  switchModeButton: { alignItems: "center", marginTop: 20 },
  switchModeText: { color: colors.redSoft, fontSize: 13 },

  cover: { width: "100%", height: 110, backgroundColor: colors.surface2 },
  coverPlaceholder: {},
  content: { paddingHorizontal: 16, paddingBottom: 40, marginTop: -32 },
  headerRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12 },
  avatarWrap: {},
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  iconButtonText: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  settingsButton: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  settingsIcon: { color: colors.ink2, fontSize: 15 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { color: colors.ink, fontSize: 20, fontFamily: fonts.serif },
  handle: { color: colors.ink3, fontSize: 13, marginTop: 2, marginBottom: 14 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  statBox: { flex: 1, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  statValue: { color: colors.ink, fontSize: 20, fontFamily: fonts.serif },
  statLabel: { color: colors.ink3, fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 2 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  tag: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  tagText: { color: colors.ink2, fontSize: 12 },
  bio: { color: colors.ink2, fontSize: 13, lineHeight: 19, marginBottom: 20, maxWidth: 340 },
  sectionTitle: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 },
  catalogList: { borderTopWidth: 1, borderColor: colors.lineSoft, marginBottom: 24 },
  catalogRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  catalogLabel: { color: colors.ink, fontSize: 14 },
  catalogCount: { color: colors.ink3, fontSize: 15, fontFamily: fonts.serif },
  logoutButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  logoutButtonText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
});
