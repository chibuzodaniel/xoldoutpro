import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useAuth } from "../../lib/AuthContext";
import { uploadAndIngestAudio, type AudioIngestResult } from "../../lib/uploadAudio";
import { colors } from "../../lib/theme";
import { Pill } from "./Pill";

const ACCEPTED_TYPES = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/wave"];

type AudioState = {
  status: "idle" | "uploading" | "ready" | "error";
  error?: string;
  durationSec?: number;
  previewLength: 30 | 50 | "custom";
  previewLengthCustomSec: number;
  previewStartSec: number;
};

// Shared audio-file picker + ingest + preview-window controls, used by both
// the beat wizard (single file) and each track row in the music wizard. Web
// lets the creator drag a waveform to choose the preview window; here that's
// a plain numeric stepper instead of a canvas scrubber — same underlying
// previewStartSec/previewEndSec the API expects, just a simpler control.
export function AudioPickerBox({
  state,
  onUploadStart,
  onIngested,
  onUploadError,
  onReset,
  onPreviewChange,
}: {
  state: AudioState;
  onUploadStart: () => void;
  onIngested: (result: AudioIngestResult) => void;
  onUploadError: (message: string) => void;
  onReset: () => void;
  onPreviewChange: (patch: Partial<Pick<AudioState, "previewLength" | "previewLengthCustomSec" | "previewStartSec">>) => void;
}) {
  const { firebaseUser } = useAuth();

  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({ type: ACCEPTED_TYPES, copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0] || !firebaseUser) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? "audio/mpeg";
    onUploadStart();
    try {
      const idToken = await firebaseUser.getIdToken();
      const ingest = await uploadAndIngestAudio(asset.uri, mimeType, idToken);
      onIngested(ingest);
    } catch (e) {
      onUploadError(e instanceof Error ? e.message : "Upload failed");
    }
  }

  const length = effectiveLength(state);
  const maxStart = state.durationSec !== undefined ? Math.max(0, state.durationSec - length) : 0;

  return (
    <View style={styles.box}>
      {state.status === "idle" && (
        <TouchableOpacity style={styles.pickButton} onPress={pick}>
          <Text style={styles.pickButtonText}>Choose audio file (MP3 or WAV)</Text>
        </TouchableOpacity>
      )}
      {state.status === "uploading" && (
        <View style={styles.uploadingRow}>
          <ActivityIndicator color={colors.ink} />
          <Text style={styles.uploadingText}>Uploading and processing…</Text>
        </View>
      )}
      {state.status === "error" && (
        <View style={styles.uploadingRow}>
          <Text style={styles.errorText}>{state.error ?? "Upload failed"}</Text>
          <TouchableOpacity style={styles.pickButton} onPress={pick}>
            <Text style={styles.pickButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}
      {state.status === "ready" && state.durationSec !== undefined && (
        <View style={styles.readyWrap}>
          <View style={styles.readyHeader}>
            <Text style={styles.readyText}>Audio ready · {formatSec(state.durationSec)}</Text>
            <TouchableOpacity
              onPress={() => {
                Alert.alert("Remove audio", "This file will be removed from this draft.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", style: "destructive", onPress: onReset },
                ]);
              }}
            >
              <Text style={styles.deleteText}>Remove</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.previewLengthRow}>
            {([30, 50, "custom"] as const).map((opt) => (
              <Pill
                key={String(opt)}
                label={opt === "custom" ? "Custom" : `${opt}s`}
                active={state.previewLength === opt}
                onPress={() => onPreviewChange({ previewLength: opt })}
              />
            ))}
            {state.previewLength === "custom" && (
              <TextInput
                value={String(state.previewLengthCustomSec)}
                onChangeText={(v) => onPreviewChange({ previewLengthCustomSec: parseInt(v, 10) || 0 })}
                keyboardType="numeric"
                style={styles.customInput}
              />
            )}
          </View>

          <Text style={styles.previewLabel}>Preview window</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => onPreviewChange({ previewStartSec: Math.max(0, state.previewStartSec - 5) })}
            >
              <Text style={styles.stepperText}>−5s</Text>
            </TouchableOpacity>
            <Text style={styles.previewWindowText}>
              {formatSec(state.previewStartSec)} – {formatSec(state.previewStartSec + length)} of {formatSec(state.durationSec)}
            </Text>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => onPreviewChange({ previewStartSec: Math.min(maxStart, state.previewStartSec + 5) })}
            >
              <Text style={styles.stepperText}>+5s</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function effectiveLength(state: AudioState) {
  const raw = state.previewLength === "custom" ? state.previewLengthCustomSec : state.previewLength;
  return Math.min(Math.max(raw, 5), state.durationSec || raw);
}

function formatSec(sec: number) {
  return `${sec.toFixed(0)}s`;
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 12, padding: 14 },
  pickButton: { alignItems: "center", paddingVertical: 10 },
  pickButtonText: { color: colors.redSoft, fontSize: 13, fontWeight: "600" },
  uploadingRow: { alignItems: "center", gap: 8, paddingVertical: 6 },
  uploadingText: { color: colors.ink3, fontSize: 12 },
  errorText: { color: colors.redSoft, fontSize: 12, textAlign: "center" },
  readyWrap: { gap: 10 },
  readyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  readyText: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  deleteText: { color: colors.ink3, fontSize: 12 },
  previewLengthRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  customInput: {
    width: 60,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: colors.ink,
    fontSize: 12,
  },
  previewLabel: { color: colors.ink3, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5 },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  stepperButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  stepperText: { color: colors.ink2, fontSize: 12, fontWeight: "600" },
  previewWindowText: { color: colors.ink3, fontSize: 11.5, flex: 1, textAlign: "center" },
});
