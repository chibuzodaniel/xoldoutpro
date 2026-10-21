import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { useAuth } from "../../lib/AuthContext";
import { apiDelete, apiGet, apiPost } from "../../lib/api";
import { ADD_ON_KIND_LABEL, formatBytes, type AddOnKindName } from "../../lib/addOnRules";
import { colors } from "../../lib/theme";
import { ImageViewer } from "../messages/ImageViewer";
import { AddOnsEditor, addOnDraftsError, addOnDraftsPayload, type AddOnDraft } from "./AddOnsEditor";

type Extra = {
  id: string;
  kind: AddOnKindName;
  title: string;
  description: string | null;
  isVideoLink: boolean;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  youtubeId: string | null;
  viewUrl: string | null;
  downloadUrl: string | null;
};

const KIND_ICON: Record<AddOnKindName, string> = {
  MUSIC_VIDEO: "🎬",
  VISUALIZER: "🌀",
  ARTWORK: "🖼️",
  WALLPAPER: "📱",
  LYRICS: "📝",
  BOOKLET: "📖",
  BEHIND_THE_SCENES: "🎥",
  OTHER: "✨",
};

const isMedia = (x: Extra) => Boolean(x.contentType?.startsWith("image/") || x.contentType?.startsWith("video/"));

/**
 * Saves one purchased extra to the phone (explicit ask: "save each file"):
 * photos/videos go to the gallery, PDFs/text open the share sheet (Save to
 * Files, Drive, etc.).
 */
async function saveExtra(x: Extra) {
  if (!x.downloadUrl) return;
  const name = (x.fileName || x.title).replace(/[\\/:*?"<>|]/g, "_");
  const dest = new File(Paths.cache, `extra-${x.id}-${name}`);
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(x.downloadUrl, dest);
  if (isMedia(x)) {
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) throw new Error("Allow XOLDOUT to save to your photos in Settings, then try again.");
    await MediaLibrary.saveToLibraryAsync(file.uri);
  } else {
    await Sharing.shareAsync(file.uri, { mimeType: x.contentType ?? undefined, dialogTitle: x.title });
  }
}

// Mirrors web's components/addons/ReleaseExtras.tsx — a release's Extras
// (Creative Add-ons, V1.2). Everyone sees what's included; only a buyer or
// the artist can watch, view or save them. The artist can add/remove here.
export function ReleaseExtras({ productId }: { productId: string }) {
  const { firebaseUser } = useAuth();
  const [extras, setExtras] = useState<Extra[] | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [drafts, setDrafts] = useState<AddOnDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const idToken = firebaseUser ? await firebaseUser.getIdToken() : undefined;
    const data = await apiGet<{ addOns: Extra[]; unlocked: boolean; isCreator: boolean }>(`/api/products/${productId}/add-ons`, idToken).catch(() => null);
    if (!data) return;
    setExtras(data.addOns);
    setUnlocked(data.unlocked);
    setIsCreator(data.isCreator);
  }, [productId, firebaseUser]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!extras || (extras.length === 0 && !isCreator)) return null;

  function open(x: Extra) {
    if (x.youtubeId) return Linking.openURL(`https://www.youtube.com/watch?v=${x.youtubeId}`);
    if (!x.viewUrl) return;
    if (x.contentType?.startsWith("image/")) return setViewImage(x.viewUrl);
    Linking.openURL(x.viewUrl);
  }

  async function saveOne(x: Extra) {
    setBusy(x.id);
    try {
      await saveExtra(x);
      if (isMedia(x)) Alert.alert("Saved", `"${x.title}" is in your photos.`);
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function saveAll() {
    const files = (extras ?? []).filter((x) => x.downloadUrl);
    let saved = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        setBusy(`all:${i + 1}/${files.length}`);
        await saveExtra(files[i]);
        saved++;
      }
      Alert.alert("Done", `Saved ${saved} extra${saved === 1 ? "" : "s"}. Photos and videos are in your gallery.`);
    } catch (e) {
      Alert.alert("Couldn't save everything", `${saved} of ${files.length} saved. ${e instanceof Error ? e.message : ""}`);
    } finally {
      setBusy(null);
    }
  }

  async function saveNew() {
    if (!firebaseUser) return;
    const error = addOnDraftsError(drafts);
    if (error) return Alert.alert("Extras not ready", error);
    if (drafts.length === 0) return setManaging(false);
    setSaving(true);
    try {
      const data = await apiPost<{ addOns: Extra[] }>(`/api/products/${productId}/add-ons`, await firebaseUser.getIdToken(), { addOns: addOnDraftsPayload(drafts) });
      setExtras(data.addOns);
      setDrafts([]);
      setManaging(false);
    } catch (e) {
      Alert.alert("Couldn't save extras", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  function remove(x: Extra) {
    Alert.alert("Remove extra?", `Remove "${x.title}" from this release? Buyers will no longer see it.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          if (!firebaseUser) return;
          const data = await apiDelete<{ addOns: Extra[] }>(`/api/products/${productId}/add-ons?addOnId=${x.id}`, await firebaseUser.getIdToken()).catch(() => null);
          if (data) setExtras(data.addOns);
          else Alert.alert("Couldn't remove that extra");
        },
      },
    ]);
  }

  const fileCount = extras.filter((x) => x.downloadUrl).length;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Text style={styles.sectionTitle}>Extras</Text>
          <View style={styles.ePlus}>
            <Text style={styles.ePlusText}>E+</Text>
          </View>
        </View>
        {unlocked && fileCount > 0 && (
          <TouchableOpacity onPress={saveAll} disabled={busy !== null}>
            <Text style={styles.link}>{busy?.startsWith("all:") ? `Saving ${busy.slice(4)}…` : "Download all"}</Text>
          </TouchableOpacity>
        )}
      </View>
      {!unlocked && extras.length > 0 && <Text style={styles.note}>Comes with your purchase:</Text>}

      {extras.map((x) => (
        <View key={x.id} style={styles.row}>
          <View style={styles.icon}>
            <Text style={styles.iconText}>{unlocked ? KIND_ICON[x.kind] : "🔒"}</Text>
          </View>
          <View style={styles.info}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {x.title}
            </Text>
            <Text style={styles.rowMeta} numberOfLines={1}>
              {ADD_ON_KIND_LABEL[x.kind]}
              {x.isVideoLink ? " · Watch online" : x.sizeBytes ? ` · ${formatBytes(x.sizeBytes)}` : ""}
              {x.description ? ` · ${x.description}` : ""}
            </Text>
          </View>
          {unlocked && (
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => open(x)}>
                <Text style={styles.action}>{x.youtubeId || x.contentType?.startsWith("video/") ? "Watch" : "View"}</Text>
              </TouchableOpacity>
              {x.downloadUrl &&
                (busy === x.id ? (
                  <ActivityIndicator color={colors.redSoft} size="small" />
                ) : (
                  <TouchableOpacity onPress={() => saveOne(x)} disabled={busy !== null}>
                    <Text style={styles.link}>Save</Text>
                  </TouchableOpacity>
                ))}
              {isCreator && (
                <TouchableOpacity onPress={() => remove(x)} hitSlop={8}>
                  <Text style={styles.removeX}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      ))}
      {!unlocked && extras.length > 0 && <Text style={styles.note}>Buy this release to unlock and save these extras.</Text>}

      {isCreator &&
        (managing ? (
          <View style={styles.manage}>
            <AddOnsEditor drafts={drafts} onChange={setDrafts} existingCount={extras.length} />
            <View style={styles.manageButtons}>
              <TouchableOpacity style={styles.saveButton} onPress={saveNew} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.saveText}>Save extras</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setDrafts([]);
                  setManaging(false);
                }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setManaging(true)} style={{ marginTop: 10 }}>
            <Text style={styles.link}>+ Add extras to this release</Text>
          </TouchableOpacity>
        ))}

      <ImageViewer uri={viewImage} onClose={() => setViewImage(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 8, marginBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  ePlus: { backgroundColor: colors.red, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  ePlusText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  note: { color: colors.ink3, fontSize: 12, marginVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  icon: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 17 },
  info: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  rowMeta: { color: colors.ink3, fontSize: 11, marginTop: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 12 },
  action: { color: colors.ink2, fontSize: 12, fontWeight: "600" },
  link: { color: colors.redSoft, fontSize: 12, fontWeight: "600" },
  removeX: { color: colors.ink3, fontSize: 13 },
  manage: { marginTop: 12, gap: 10 },
  manageButtons: { flexDirection: "row", gap: 8 },
  saveButton: { flex: 1, backgroundColor: colors.red, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  saveText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  cancelButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16 },
  cancelText: { color: colors.ink2, fontSize: 14, fontWeight: "600" },
});
