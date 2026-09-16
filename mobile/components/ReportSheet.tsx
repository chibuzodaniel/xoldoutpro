import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useAuth } from "../lib/AuthContext";
import { apiPost } from "../lib/api";
import { colors, fonts } from "../lib/theme";

export type ReportReason = "INAPPROPRIATE_CONTENT" | "COPYRIGHT_CLAIM" | "BUG" | "FEATURE_REQUEST";
export type ReportTargetType = "PRODUCT" | "EVENT" | "POST" | "PROFILE";

const CONTENT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "INAPPROPRIATE_CONTENT", label: "Inappropriate content" },
  { value: "COPYRIGHT_CLAIM", label: "Copyright claim" },
];

// Mirrors web's components/trust/ReportSheet.tsx — same bottom-sheet shape
// as PublishScreen, and the same two content-report reasons ReportButton
// hardcodes on web (BUG/FEATURE_REQUEST exist server-side for the separate
// feedback flow, not this one).
export function ReportSheet({
  visible,
  onClose,
  targetType,
  targetId,
}: {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
}) {
  const { firebaseUser } = useAuth();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function reset() {
    setReason(null);
    setDetails("");
    setDone(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!reason || !firebaseUser) return;
    setSubmitting(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPost("/api/reports", idToken, { targetType, targetId, reason, details: details.trim() || undefined });
      setDone(true);
    } catch (e) {
      Alert.alert("Could not submit report", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TouchableOpacity style={styles.backdropTapArea} activeOpacity={1} onPress={handleClose} />
        <View style={styles.sheet}>
          {done ? (
            <View style={styles.doneWrap}>
              <Text style={styles.doneTitle}>Report submitted</Text>
              <Text style={styles.doneSubtitle}>Thanks — our team will take a look.</Text>
              <TouchableOpacity style={styles.submitButton} onPress={handleClose}>
                <Text style={styles.submitButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.title}>Report</Text>
              <View style={styles.reasonList}>
                {CONTENT_REASONS.map((r) => (
                  <TouchableOpacity key={r.value} style={styles.reasonRow} onPress={() => setReason(r.value)}>
                    <Text style={styles.reasonLabel}>{r.label}</Text>
                    <View style={[styles.radio, reason === r.value && styles.radioActive]} />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                value={details}
                onChangeText={(v) => setDetails(v.slice(0, 1000))}
                placeholder="Add any detail that might help (optional)"
                placeholderTextColor={colors.ink3}
                multiline
                numberOfLines={3}
                style={styles.textarea}
              />
              <TouchableOpacity
                style={[styles.submitButton, (!reason || submitting) && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={!reason || submitting}
              >
                {submitting ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitButtonText}>Submit report</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  backdropTapArea: { flex: 1 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  title: { color: colors.ink, fontSize: 22, fontFamily: fonts.serif, marginBottom: 16 },
  reasonList: { borderTopWidth: 1, borderColor: colors.lineSoft, marginBottom: 12 },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  reasonLabel: { color: colors.ink, fontSize: 14 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.lineStrong },
  radioActive: { borderColor: colors.red, backgroundColor: colors.red },
  textarea: {
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: 10,
    padding: 12,
    color: colors.ink,
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  submitButton: { backgroundColor: colors.red, borderRadius: 10, paddingVertical: 13, alignItems: "center", marginBottom: 8 },
  submitButtonDisabled: { opacity: 0.4 },
  submitButtonText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  cancelButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  cancelText: { color: colors.ink2, fontSize: 14, fontWeight: "600" },
  doneWrap: { alignItems: "center", paddingVertical: 12 },
  doneTitle: { color: colors.ink, fontSize: 15, fontWeight: "600", marginBottom: 4 },
  doneSubtitle: { color: colors.ink3, fontSize: 12, marginBottom: 18 },
});
