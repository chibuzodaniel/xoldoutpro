import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { signOut } from "firebase/auth";
import { firebaseAuth } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { apiPatch, apiPost, apiDelete } from "../lib/api";
import { uploadImage } from "../lib/uploadImage";
import { enablePush, disablePush } from "../lib/push";
import type { RootStackParamList } from "../lib/navigation";
import type { SocialLink } from "../lib/authTypes";
import { colors, fonts } from "../lib/theme";
import { Pill } from "../components/creator/Pill";

const SUGGESTED_TAGS = ["Artist", "Producer", "Manager", "Label"];
const PLATFORMS: SocialLink["platform"][] = ["Instagram", "X", "TikTok", "YouTube", "Website"];

export function EditProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { appUser, firebaseUser, refreshAppUser } = useAuth();

  const [handle, setHandle] = useState(appUser?.handle ?? "");
  const [displayName, setDisplayName] = useState(appUser?.displayName ?? "");
  const [bio, setBio] = useState(appUser?.bio ?? "");
  const [tags, setTags] = useState<string[]>(appUser?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(appUser?.socialLinks ?? []);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(appUser?.avatarUrl ?? null);
  const [coverPreview, setCoverPreview] = useState<string | null>(appUser?.coverUrl ?? null);
  const [avatarPending, setAvatarPending] = useState<{ uri: string; mimeType: string } | null>(null);
  const [coverPending, setCoverPending] = useState<{ uri: string; mimeType: string } | null>(null);
  const [digestSubscribed, setDigestSubscribed] = useState(appUser?.emailDigestSubscribed ?? false);
  const [digestBusy, setDigestBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(appUser?.pushEnabled ?? false);
  const [pushBusy, setPushBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: "Settings" });
  }, [navigation]);

  function addTag(tag: string) {
    const t = tag.trim();
    if (!t || tags.includes(t) || tags.length >= 8) return;
    setTags((cur) => [...cur, t]);
    setTagInput("");
  }

  function addSocialLink() {
    if (socialLinks.length >= 6) return;
    setSocialLinks((cur) => [...cur, { platform: "Instagram", url: "" }]);
  }

  function updateSocialLink(index: number, patch: Partial<SocialLink>) {
    setSocialLinks((cur) => cur.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function pickPhoto(kind: "avatar" | "cover") {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: kind === "avatar" ? [1, 1] : [3, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? "image/jpeg";
    if (kind === "avatar") {
      setAvatarPreview(asset.uri);
      setAvatarPending({ uri: asset.uri, mimeType });
    } else {
      setCoverPreview(asset.uri);
      setCoverPending({ uri: asset.uri, mimeType });
    }
  }

  async function handleToggleDigest() {
    if (!firebaseUser) return;
    setDigestBusy(true);
    const next = !digestSubscribed;
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPatch("/api/me", idToken, { emailDigestSubscribed: next });
      setDigestSubscribed(next);
    } catch {
      Alert.alert("Could not update");
    } finally {
      setDigestBusy(false);
    }
  }

  async function handleTogglePush() {
    if (!firebaseUser) return;
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await disablePush(firebaseUser);
        setPushEnabled(false);
      } else {
        const result = await enablePush(firebaseUser);
        if (!result.ok) Alert.alert("Could not enable push", result.error);
        else setPushEnabled(true);
      }
    } finally {
      setPushBusy(false);
    }
  }

  async function handleSubmit() {
    if (!firebaseUser) return;
    setBusy(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const cleanLinks = socialLinks.filter((l) => l.url.trim().length > 0);
      await apiPatch("/api/me", idToken, { handle, displayName, bio, tags, socialLinks: cleanLinks });
      if (avatarPending) {
        const key = await uploadImage(avatarPending.uri, avatarPending.mimeType, "avatar", idToken);
        await apiPost("/api/me/avatar", idToken, { key });
      }
      if (coverPending) {
        const key = await uploadImage(coverPending.uri, coverPending.mimeType, "cover", idToken);
        await apiPost("/api/me/cover", idToken, { key });
      }
      await refreshAppUser();
      Alert.alert("Saved", "Profile updated.", [{ text: "OK", onPress: () => navigation.goBack() }]);
    } catch (e) {
      Alert.alert("Could not save profile", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await signOut(firebaseAuth);
    navigation.navigate("Tabs", { screen: "Profile" });
  }

  // Alert.prompt is iOS-only, so the confirmation lives in its own sheet
  // (below) rather than a native prompt, matching web's DeleteAccountSheet:
  // the typed phrase is sent to the server, which is the only place that
  // actually validates it (`DELETE <handle>`, exact match).
  async function handleDeleteAccount() {
    if (!appUser || !firebaseUser) return;
    setDeleteBusy(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiDelete("/api/me", idToken, { confirmation: deleteConfirmText });
      await signOut(firebaseAuth);
    } catch (e) {
      Alert.alert("Could not delete account", e instanceof Error ? e.message : `Make sure you typed "DELETE ${appUser.handle}" exactly.`);
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!appUser) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Photos</Text>
      <Text style={styles.label}>Cover photo</Text>
      <TouchableOpacity style={styles.coverPicker} onPress={() => pickPhoto("cover")}>
        {coverPreview ? <Image source={{ uri: coverPreview }} style={styles.coverImage} /> : <Text style={styles.pickerPlaceholder}>Add cover photo</Text>}
      </TouchableOpacity>
      <Text style={styles.label}>Avatar</Text>
      <TouchableOpacity style={styles.avatarPicker} onPress={() => pickPhoto("avatar")}>
        {avatarPreview ? <Image source={{ uri: avatarPreview }} style={styles.avatarImage} /> : <Text style={styles.pickerPlaceholderSmall}>Add</Text>}
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Profile</Text>
      <Text style={styles.label}>Handle</Text>
      <TextInput
        value={handle}
        onChangeText={(v) => setHandle(v.toLowerCase())}
        autoCapitalize="none"
        maxLength={24}
        style={styles.input}
        placeholderTextColor={colors.ink3}
      />
      <Text style={styles.label}>Display name</Text>
      <TextInput value={displayName} onChangeText={setDisplayName} maxLength={60} style={styles.input} placeholderTextColor={colors.ink3} />

      <Text style={styles.sectionTitle}>Bio</Text>
      <TextInput
        value={bio}
        onChangeText={setBio}
        maxLength={280}
        multiline
        numberOfLines={3}
        style={[styles.input, styles.textarea]}
        placeholderTextColor={colors.ink3}
      />

      <Text style={styles.sectionTitle}>Tags</Text>
      <View style={styles.tagsRow}>
        {tags.map((tag) => (
          <TouchableOpacity key={tag} style={styles.tagChip} onPress={() => setTags((cur) => cur.filter((t) => t !== tag))}>
            <Text style={styles.tagChipText}>{tag} ✕</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.suggestedRow}>
        {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((t) => (
          <Pill key={t} label={t} active={false} onPress={() => addTag(t)} />
        ))}
      </View>
      <View style={styles.tagInputRow}>
        <TextInput
          value={tagInput}
          onChangeText={setTagInput}
          onSubmitEditing={() => addTag(tagInput)}
          placeholder="Add a tag"
          placeholderTextColor={colors.ink3}
          maxLength={24}
          style={[styles.input, styles.tagInput]}
        />
        <TouchableOpacity style={styles.addButton} onPress={() => addTag(tagInput)}>
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Social accounts</Text>
      {socialLinks.map((link, i) => (
        <View key={i} style={styles.socialRow}>
          <View style={styles.platformRow}>
            {PLATFORMS.map((p) => (
              <Pill key={p} label={p} active={link.platform === p} onPress={() => updateSocialLink(i, { platform: p })} />
            ))}
          </View>
          <View style={styles.socialUrlRow}>
            <TextInput
              value={link.url}
              onChangeText={(v) => updateSocialLink(i, { url: v })}
              placeholder="https://..."
              placeholderTextColor={colors.ink3}
              autoCapitalize="none"
              style={[styles.input, styles.socialUrlInput]}
            />
            <TouchableOpacity onPress={() => setSocialLinks((cur) => cur.filter((_, idx) => idx !== i))}>
              <Text style={styles.removeLink}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {socialLinks.length < 6 && (
        <TouchableOpacity onPress={addSocialLink}>
          <Text style={styles.addLink}>+ Add social account</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitButtonText}>Save Changes</Text>}
      </TouchableOpacity>

      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleTitle}>Get notified in the background</Text>
          <Text style={styles.toggleSubtitle}>New releases, purchases, and follows — even when the app isn't open.</Text>
        </View>
        <Switch value={pushEnabled} onValueChange={handleTogglePush} disabled={pushBusy} trackColor={{ true: colors.red }} />
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleTitle}>Best-sellers, by email</Text>
          <Text style={styles.toggleSubtitle}>Weekly, monthly, and yearly top songs plus a few things worth checking out.</Text>
        </View>
        <Switch value={digestSubscribed} onValueChange={handleToggleDigest} disabled={digestBusy} trackColor={{ true: colors.red }} />
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => {
          setDeleteConfirmText("");
          setDeleteSheetOpen(true);
        }}
      >
        <Text style={styles.deleteButtonText}>Delete Account</Text>
      </TouchableOpacity>

      <Modal visible={deleteSheetOpen} animationType="slide" transparent onRequestClose={() => setDeleteSheetOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Delete account</Text>
            <Text style={styles.sheetBody}>
              This cannot be undone from here. Type &quot;DELETE {appUser.handle}&quot; exactly to confirm.
            </Text>
            <TextInput
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              autoCapitalize="characters"
              placeholder={`DELETE ${appUser.handle}`}
              placeholderTextColor={colors.ink3}
              style={styles.input}
            />
            <TouchableOpacity
              style={[styles.deleteButton, styles.sheetDeleteButton, (deleteBusy || deleteConfirmText !== `DELETE ${appUser.handle}`) && styles.buttonDisabled]}
              onPress={handleDeleteAccount}
              disabled={deleteBusy || deleteConfirmText !== `DELETE ${appUser.handle}`}
            >
              {deleteBusy ? <ActivityIndicator color={colors.redSoft} /> : <Text style={styles.deleteButtonText}>Delete Account</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setDeleteSheetOpen(false)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 60 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  sectionTitle: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 22, marginBottom: 10 },
  label: { color: colors.ink3, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 10 },
  coverPicker: { height: 96, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  coverImage: { width: "100%", height: "100%" },
  avatarPicker: { width: 80, height: 80, borderRadius: 40, borderWidth: 1, borderStyle: "dashed", borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%" },
  pickerPlaceholder: { color: colors.ink3, fontSize: 12 },
  pickerPlaceholderSmall: { color: colors.ink3, fontSize: 11 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.ink,
    fontSize: 14,
  },
  textarea: { minHeight: 70, textAlignVertical: "top" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  tagChip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tagChipText: { color: colors.ink2, fontSize: 12 },
  suggestedRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  tagInputRow: { flexDirection: "row", gap: 8 },
  tagInput: { flex: 1 },
  addButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  addButtonText: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  socialRow: { gap: 8, marginBottom: 12 },
  platformRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  socialUrlRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  socialUrlInput: { flex: 1 },
  removeLink: { color: colors.ink3, fontSize: 16 },
  addLink: { color: colors.redSoft, fontSize: 13, fontWeight: "600", marginTop: 4 },
  submitButton: { backgroundColor: colors.red, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 24 },
  submitButtonText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginTop: 24 },
  toggleInfo: { flex: 1 },
  toggleTitle: { color: colors.ink, fontSize: 13, fontWeight: "600", marginBottom: 2 },
  toggleSubtitle: { color: colors.ink3, fontSize: 11.5, lineHeight: 16 },
  logoutButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 24 },
  logoutText: { color: colors.redSoft, fontSize: 14, fontWeight: "600" },
  dangerTitle: { marginTop: 24 },
  deleteButton: { borderWidth: 1, borderColor: colors.redSoft, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  deleteButtonText: { color: colors.redSoft, fontSize: 14, fontWeight: "600" },
  buttonDisabled: { opacity: 0.4 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, gap: 12 },
  sheetTitle: { color: colors.ink, fontSize: 20, fontFamily: fonts.serif },
  sheetBody: { color: colors.ink2, fontSize: 13, lineHeight: 18 },
  sheetDeleteButton: { marginTop: 4 },
  sheetCancel: { alignItems: "center", paddingVertical: 10 },
  sheetCancelText: { color: colors.ink3, fontSize: 13, fontWeight: "600" },
});
