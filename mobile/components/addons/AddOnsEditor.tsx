import { ActivityIndicator, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useAuth } from "../../lib/AuthContext";
import { uploadAddOnFile } from "../../lib/uploadAddOn";
import {
  ADD_ON_CONTENT_TYPES,
  ADD_ON_KINDS,
  ADD_ON_KIND_LABEL,
  MAX_ADD_ONS_PER_PRODUCT,
  VIDEO_KINDS,
  formatBytes,
  parseYouTubeId,
  type AddOnKindName,
} from "../../lib/addOnRules";
import { colors } from "../../lib/theme";
import { Pill } from "../creator/Pill";

export type AddOnDraft = {
  localId: string;
  kind: AddOnKindName;
  title: string;
  description: string;
  source: "youtube" | "file";
  youtubeUrl: string;
  status: "idle" | "uploading" | "ready" | "error";
  fileKey?: string;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
  error?: string;
};

export function newAddOnDraft(): AddOnDraft {
  return { localId: Math.random().toString(36).slice(2), kind: "MUSIC_VIDEO", title: "", description: "", source: "youtube", youtubeUrl: "", status: "idle" };
}

/** Mirrors web's addOnDraftsError. */
export function addOnDraftsError(drafts: AddOnDraft[]): string | null {
  for (const d of drafts) {
    const label = d.title.trim() || ADD_ON_KIND_LABEL[d.kind];
    if (!d.title.trim()) return "Give every extra a title.";
    if (d.source === "youtube" && !parseYouTubeId(d.youtubeUrl)) return `"${label}": paste a valid YouTube link.`;
    if (d.source === "file" && d.status === "uploading") return `"${label}" is still uploading.`;
    if (d.source === "file" && d.status !== "ready") return `"${label}": add a file.`;
  }
  return null;
}

/** Mirrors web's addOnDraftsPayload. */
export function addOnDraftsPayload(drafts: AddOnDraft[]) {
  return drafts.map((d) =>
    d.source === "youtube"
      ? { kind: d.kind, title: d.title.trim(), description: d.description.trim() || undefined, youtubeUrl: d.youtubeUrl.trim() }
      : { kind: d.kind, title: d.title.trim(), description: d.description.trim() || undefined, fileKey: d.fileKey, fileName: d.fileName, contentType: d.contentType },
  );
}

// Mirrors web's components/addons/AddOnsEditor.tsx — the optional "Extras"
// section of the music upload (Creative Add-ons, V1.2). YouTube links are
// offered first and recommended for videos (explicit ask); uploads are
// capped at 100 MB.
export function AddOnsEditor({
  drafts,
  onChange,
  existingCount = 0,
}: {
  drafts: AddOnDraft[];
  onChange: (updater: (cur: AddOnDraft[]) => AddOnDraft[]) => void;
  existingCount?: number;
}) {
  const { firebaseUser } = useAuth();
  const update = (localId: string, patch: Partial<AddOnDraft>) =>
    onChange((cur) => cur.map((d) => (d.localId === localId ? { ...d, ...patch } : d)));
  const canAdd = existingCount + drafts.length < MAX_ADD_ONS_PER_PRODUCT;

  async function pickFile(d: AddOnDraft) {
    const result = await DocumentPicker.getDocumentAsync({ type: [...ADD_ON_CONTENT_TYPES], copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0] || !firebaseUser) return;
    const asset = result.assets[0];
    const contentType = asset.mimeType ?? "application/octet-stream";
    update(d.localId, { status: "uploading", error: undefined, fileName: asset.name, contentType, sizeBytes: asset.size });
    try {
      const key = await uploadAddOnFile(asset.uri, contentType, asset.size, await firebaseUser.getIdToken());
      update(d.localId, { status: "ready", fileKey: key });
    } catch (e) {
      update(d.localId, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
    }
  }

  return (
    <View style={styles.wrap}>
      {drafts.map((d, i) => (
        <View key={d.localId} style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.index}>Extra {existingCount + i + 1}</Text>
            <TouchableOpacity onPress={() => onChange((cur) => cur.filter((x) => x.localId !== d.localId))}>
              <Text style={styles.remove}>Remove</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.kindRow}>
            {ADD_ON_KINDS.map((k) => (
              <Pill
                key={k}
                label={ADD_ON_KIND_LABEL[k]}
                active={d.kind === k}
                onPress={() =>
                  update(d.localId, { kind: k, ...(d.status === "idle" && !d.youtubeUrl ? { source: VIDEO_KINDS.has(k) ? "youtube" : "file" } : {}) })
                }
              />
            ))}
          </View>

          <TextInput
            value={d.title}
            onChangeText={(v) => update(d.localId, { title: v })}
            placeholder="Title, e.g. Official music video"
            placeholderTextColor={colors.ink3}
            maxLength={120}
            style={styles.input}
          />
          <TextInput
            value={d.description}
            onChangeText={(v) => update(d.localId, { description: v })}
            placeholder="Short description (optional)"
            placeholderTextColor={colors.ink3}
            maxLength={500}
            style={styles.input}
          />

          <View style={styles.kindRow}>
            <Pill label="YouTube link" active={d.source === "youtube"} onPress={() => update(d.localId, { source: "youtube" })} />
            <Pill label="Upload file" active={d.source === "file"} onPress={() => update(d.localId, { source: "file" })} />
          </View>

          {d.source === "youtube" ? (
            <>
              <TextInput
                value={d.youtubeUrl}
                onChangeText={(v) => update(d.localId, { youtubeUrl: v })}
                placeholder="https://youtu.be/…"
                placeholderTextColor={colors.ink3}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.input}
              />
              <Text style={styles.hint}>
                <Text style={styles.recommended}>Recommended for videos. </Text>
                Nothing to upload, and it plays instantly for fans. Tip: set the video to Unlisted on YouTube so only buyers find it here.
              </Text>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.fileBox} onPress={() => pickFile(d)} disabled={d.status === "uploading"}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {d.fileName ? `${d.fileName}${d.sizeBytes ? ` · ${formatBytes(d.sizeBytes)}` : ""}` : "Choose an image, video, PDF or text file"}
                </Text>
                {d.status === "uploading" ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.browse}>{d.fileName ? "Change" : "Browse"}</Text>}
              </TouchableOpacity>
              {d.status === "ready" && <Text style={styles.ok}>Uploaded</Text>}
              {d.error && <Text style={styles.error}>{d.error}</Text>}
              <Text style={styles.hint}>
                Up to 100 MB. For music videos, a YouTube link is preferred — uploads are best for artwork, wallpapers, lyrics, booklets and short clips.
              </Text>
            </>
          )}
        </View>
      ))}

      {canAdd && (
        <TouchableOpacity style={styles.addButton} onPress={() => onChange((cur) => [...cur, newAddOnDraft()])}>
          <Text style={styles.addText}>+ Add an extra</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  card: { borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 12, padding: 12, gap: 10, backgroundColor: colors.surface },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  index: { color: colors.ink3, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" },
  remove: { color: colors.ink3, fontSize: 11.5 },
  kindRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.ink,
    fontSize: 13,
  },
  hint: { color: colors.ink3, fontSize: 11, lineHeight: 15 },
  recommended: { color: colors.green, fontWeight: "700" },
  fileBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  fileName: { color: colors.ink2, fontSize: 13, flex: 1 },
  browse: { color: colors.redSoft, fontSize: 12, fontWeight: "600" },
  ok: { color: colors.green, fontSize: 11 },
  error: { color: colors.redSoft, fontSize: 11 },
  addButton: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.line, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  addText: { color: colors.ink2, fontSize: 13, fontWeight: "600" },
});
