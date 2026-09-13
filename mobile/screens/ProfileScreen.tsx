import { useState } from "react";
import {
  ActivityIndicator,
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
import { useAuth } from "../lib/AuthContext";
import { friendlyFirebaseError } from "../lib/friendlyFirebaseError";
import { colors, fonts } from "../lib/theme";
import { Avatar } from "../components/Avatar";

function SignedInView() {
  const { appUser, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!appUser) return null;

  async function handleLogout() {
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.content}>
      <View style={styles.profileRow}>
        <Avatar uri={appUser.avatarUrl} name={appUser.displayName} index={0} size={64} />
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{appUser.displayName}</Text>
          <Text style={styles.handle}>@{appUser.handle}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.secondaryButton} onPress={handleLogout} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.secondaryButtonText}>Log out</Text>}
      </TouchableOpacity>
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
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.content}>
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
  content: { flex: 1, padding: 20, justifyContent: "center" },
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
  profileRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 32 },
  profileInfo: { flex: 1 },
  name: { color: colors.ink, fontSize: 18, fontFamily: fonts.serif },
  handle: { color: colors.ink3, fontSize: 13, marginTop: 2 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
});
