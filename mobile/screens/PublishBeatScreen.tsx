import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { useAuth } from "../lib/AuthContext";
import { apiPost } from "../lib/api";
import { colors, fonts } from "../lib/theme";
import type { RootStackParamList } from "../lib/navigation";
import { SquareImagePicker } from "../components/creator/SquareImagePicker";
import { LabeledInput } from "../components/creator/LabeledInput";
import { PriceField } from "../components/creator/PriceField";
import { CapField } from "../components/creator/CapField";
import { AudioPickerBox } from "../components/creator/AudioPickerBox";

type AudioState = {
  status: "idle" | "uploading" | "ready" | "error";
  error?: string;
  durationSec?: number;
  peaks?: number[];
  audioMasterKey?: string;
  audioStreamKey?: string;
  waveformPeaksKey?: string;
  previewLength: 30 | 50 | "custom";
  previewLengthCustomSec: number;
  previewStartSec: number;
};

function effectiveLength(a: AudioState) {
  const raw = a.previewLength === "custom" ? a.previewLengthCustomSec : a.previewLength;
  return Math.min(Math.max(raw, 5), a.durationSec || raw);
}

export function PublishBeatScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [priceNaira, setPriceNaira] = useState("");
  const [hasCap, setHasCap] = useState(false);
  const [capValue, setCapValue] = useState("");
  const [bpm, setBpm] = useState("");
  const [musicalKey, setMusicalKey] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [coverLadder, setCoverLadder] = useState<Record<string, string> | null>(null);
  const [audio, setAudio] = useState<AudioState>({ status: "idle", previewLength: 30, previewLengthCustomSec: 30, previewStartSec: 0 });
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function addTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t) || tags.length >= 8) return;
    setTags((cur) => [...cur, t]);
    setTagInput("");
  }

  async function handleSubmit() {
    if (!firebaseUser) return;
    if (!title.trim()) return Alert.alert("Missing title", "Give this beat a title.");
    if (!coverLadder) return Alert.alert("Missing cover art", "Add a cover image before publishing.");
    if (audio.status !== "ready" || audio.durationSec === undefined) {
      return Alert.alert("Audio not ready", "Upload the beat's audio file first.");
    }
    const priceKobo = isFree ? 0 : Math.round(parseFloat(priceNaira || "0") * 100);
    if (!isFree && (!priceNaira || priceKobo <= 0)) return Alert.alert("Missing price", "Set a price, or mark this beat free.");
    const cap = hasCap ? parseInt(capValue, 10) : null;
    if (hasCap && (!capValue || !Number.isInteger(cap) || (cap as number) <= 0)) {
      return Alert.alert("Invalid quantity", "Enter a valid limited quantity.");
    }
    if (!ownershipConfirmed) return Alert.alert("Confirm rights", "Confirm you own or have the rights to license this beat.");

    const length = effectiveLength(audio);
    setSubmitting(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const payload = {
        title,
        description,
        priceKobo,
        cap,
        coverImageLadder: coverLadder,
        audioMasterKey: audio.audioMasterKey,
        audioStreamKey: audio.audioStreamKey,
        waveformPeaksKey: audio.waveformPeaksKey,
        durationSec: audio.durationSec,
        previewStartSec: audio.previewStartSec,
        previewEndSec: audio.previewStartSec + length,
        bpm: bpm ? parseInt(bpm, 10) : undefined,
        musicalKey: musicalKey || undefined,
        tags,
        ownershipConfirmed,
      };
      await apiPost("/api/beats", idToken, payload);
      Alert.alert("Published", "Your beat is live.", [{ text: "OK", onPress: () => navigation.navigate("Tabs") }]);
    } catch (e) {
      Alert.alert("Could not publish", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.title}>Upload Beat</Text>

      <SquareImagePicker label="Cover art" placeholder="Add square cover art" ladder={coverLadder} onChange={setCoverLadder} />

      <LabeledInput label="Title" value={title} onChangeText={setTitle} maxLength={200} />
      <LabeledInput
        label="Description"
        value={description}
        onChangeText={setDescription}
        maxLength={2000}
        multiline
        numberOfLines={3}
        style={styles.textArea}
      />

      <View style={styles.row}>
        <View style={styles.flex1}>
          <LabeledInput label="BPM (optional)" value={bpm} onChangeText={setBpm} keyboardType="numeric" />
        </View>
        <View style={styles.flex1}>
          <LabeledInput label="Key (optional)" value={musicalKey} onChangeText={setMusicalKey} placeholder="e.g. C minor" maxLength={10} />
        </View>
      </View>

      <View style={styles.tagsSection}>
        <Text style={styles.sectionLabel}>Tags</Text>
        <View style={styles.tagsRow}>
          {tags.map((tag) => (
            <TouchableOpacity key={tag} style={styles.tagChip} onPress={() => setTags((cur) => cur.filter((t) => t !== tag))}>
              <Text style={styles.tagText}>{tag} ✕</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.tagInputRow}>
          <TextInput
            value={tagInput}
            onChangeText={setTagInput}
            onSubmitEditing={addTag}
            placeholder="e.g. Afrobeats, Trap"
            placeholderTextColor={colors.ink3}
            maxLength={24}
            style={styles.tagInput}
          />
          <TouchableOpacity style={styles.addTagButton} onPress={addTag}>
            <Text style={styles.addTagText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      <PriceField
        allowFree
        isFree={isFree}
        onFreeChange={setIsFree}
        priceNaira={priceNaira}
        onPriceChange={setPriceNaira}
        hint="One price, full commercial-use license — buyers get the master file, forever."
      />

      <CapField hasCap={hasCap} onHasCapChange={setHasCap} capValue={capValue} onCapValueChange={setCapValue} placeholder="e.g. 50" />

      <View style={styles.audioSection}>
        <Text style={styles.sectionLabel}>Audio file</Text>
        <AudioPickerBox
          state={audio}
          onUploadStart={() => setAudio((a) => ({ ...a, status: "uploading", error: undefined }))}
          onIngested={(result) =>
            setAudio((a) => ({
              ...a,
              status: "ready",
              durationSec: result.durationSec,
              peaks: result.peaks,
              audioMasterKey: result.audioMasterKey,
              audioStreamKey: result.audioStreamKey,
              waveformPeaksKey: result.waveformPeaksKey,
              previewLength: result.durationSec >= 30 ? 30 : "custom",
              previewLengthCustomSec: Math.min(30, result.durationSec),
              previewStartSec: result.previewDefaults.start,
            }))
          }
          onUploadError={(message) => setAudio((a) => ({ ...a, status: "error", error: message }))}
          onReset={() =>
            setAudio({ status: "idle", previewLength: 30, previewLengthCustomSec: 30, previewStartSec: 0 })
          }
          onPreviewChange={(patch) => setAudio((a) => ({ ...a, ...patch }))}
        />
      </View>

      <TouchableOpacity style={styles.ownershipRow} onPress={() => setOwnershipConfirmed((v) => !v)}>
        <View style={[styles.checkbox, ownershipConfirmed && styles.checkboxChecked]}>
          {ownershipConfirmed && <Text style={styles.checkboxTick}>✓</Text>}
        </View>
        <Text style={styles.ownershipText}>
          I own this beat, or have the rights to license it — including any samples used — and agree to XOLDOUT's Producer Agreement.
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting || !ownershipConfirmed}>
        {submitting ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitText}>Publish</Text>}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 60, gap: 20 },
  title: { color: colors.ink, fontSize: 22, fontFamily: fonts.serif },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 12 },
  flex1: { flex: 1 },
  sectionLabel: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  tagsSection: { gap: 8 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { color: colors.ink2, fontSize: 11.5 },
  tagInputRow: { flexDirection: "row", gap: 8 },
  tagInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.ink,
    fontSize: 13,
  },
  addTagButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  addTagText: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  audioSection: { gap: 10 },
  ownershipRow: { flexDirection: "row", gap: 10, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 10, padding: 12 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.red, borderColor: colors.red },
  checkboxTick: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  ownershipText: { flex: 1, color: colors.ink2, fontSize: 12, lineHeight: 17 },
  submitButton: { backgroundColor: colors.red, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  submitText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
});
