import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { useAuth } from "../lib/AuthContext";
import { apiPost } from "../lib/api";
import { colors, fonts } from "../lib/theme";
import type { RootStackParamList } from "../lib/navigation";
import { effectivePreviewLength, type ReleaseType, type TrackDraft } from "../lib/creatorTypes";
import { Pill } from "../components/creator/Pill";
import { LabeledInput } from "../components/creator/LabeledInput";
import { SquareImagePicker } from "../components/creator/SquareImagePicker";
import { PriceField } from "../components/creator/PriceField";
import { CapField } from "../components/creator/CapField";
import { AudioPickerBox } from "../components/creator/AudioPickerBox";

function newTrack(): TrackDraft {
  return {
    localId: Math.random().toString(36).slice(2),
    title: "",
    description: "",
    lyricsText: "",
    status: "idle",
    previewLength: 30,
    previewLengthCustomSec: 30,
    previewStartSec: 0,
  };
}

export function PublishMusicScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();

  const [releaseType, setReleaseType] = useState<ReleaseType>("SINGLE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [priceNaira, setPriceNaira] = useState("");
  const [hasCap, setHasCap] = useState(false);
  const [capValue, setCapValue] = useState("");
  const [artworkLadder, setArtworkLadder] = useState<Record<string, string> | null>(null);
  const [tracks, setTracks] = useState<TrackDraft[]>([newTrack()]);
  const [submitting, setSubmitting] = useState(false);

  function updateTrack(localId: string, patch: Partial<TrackDraft>) {
    setTracks((cur) => cur.map((t) => (t.localId === localId ? { ...t, ...patch } : t)));
  }

  function setReleaseTypeChecked(type: ReleaseType) {
    setReleaseType(type);
    if (type === "SINGLE" && tracks.length > 1) setTracks([tracks[0]]);
  }

  const canAddTrack = releaseType !== "SINGLE" && tracks.length < 30;

  async function handleSubmit() {
    if (!firebaseUser) return;
    if (!title.trim()) return Alert.alert("Missing title", "Give this release a title.");
    if (!artworkLadder) return Alert.alert("Missing artwork", "Add artwork before publishing.");
    if (tracks.some((t) => t.status !== "ready")) return Alert.alert("Tracks not ready", "Every track needs to finish uploading first.");
    if (releaseType === "SINGLE" && tracks.length !== 1) return Alert.alert("Invalid tracks", "A single needs exactly one track.");

    const priceKobo = isFree ? 0 : Math.round(parseFloat(priceNaira || "0") * 100);
    if (!isFree && (!priceNaira || priceKobo <= 0)) return Alert.alert("Missing price", "Set a price, or mark this release free.");
    const cap = hasCap ? parseInt(capValue, 10) : null;
    if (hasCap && (!capValue || !Number.isInteger(cap) || (cap as number) <= 0)) {
      return Alert.alert("Invalid quantity", "Enter a valid limited quantity.");
    }

    setSubmitting(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const payload = {
        title,
        releaseType,
        description,
        priceKobo,
        cap,
        artworkLadder,
        tracks: tracks.map((t, order) => {
          const length = effectivePreviewLength(t);
          return {
            title: t.title || title,
            description: t.description || undefined,
            order,
            audioMasterKey: t.audioMasterKey,
            audioStreamKey: t.audioStreamKey,
            waveformPeaksKey: t.waveformPeaksKey,
            durationSec: t.durationSec,
            previewStartSec: t.previewStartSec,
            previewEndSec: t.previewStartSec + length,
            lyricsText: t.lyricsText || undefined,
          };
        }),
      };
      await apiPost("/api/releases", idToken, payload);
      Alert.alert("Published", "Your release is live.", [{ text: "OK", onPress: () => navigation.navigate("Tabs") }]);
    } catch (e) {
      Alert.alert("Could not publish", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Upload Music</Text>

      <View style={styles.typeRow}>
        {(["SINGLE", "EP", "ALBUM"] as const).map((type) => (
          <Pill
            key={type}
            label={type === "SINGLE" ? "Single" : type === "EP" ? "EP" : "Album"}
            active={releaseType === type}
            onPress={() => setReleaseTypeChecked(type)}
          />
        ))}
      </View>

      <SquareImagePicker label="Artwork" placeholder="Add square artwork" ladder={artworkLadder} onChange={setArtworkLadder} />

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

      <PriceField allowFree isFree={isFree} onFreeChange={setIsFree} priceNaira={priceNaira} onPriceChange={setPriceNaira} />

      <CapField
        hasCap={hasCap}
        onHasCapChange={setHasCap}
        capValue={capValue}
        onCapValueChange={setCapValue}
        placeholder="e.g. 500"
        hint="Once it sells out it stays sold out — the cap can be lowered later but never raised."
      />

      <View style={styles.tracksSection}>
        <View style={styles.tracksHeader}>
          <Text style={styles.sectionLabel}>Tracks</Text>
          {canAddTrack && (
            <TouchableOpacity onPress={() => setTracks((cur) => [...cur, newTrack()])}>
              <Text style={styles.addTrack}>+ Add track</Text>
            </TouchableOpacity>
          )}
        </View>

        {tracks.map((track, i) => (
          <View key={track.localId} style={styles.trackCard}>
            <View style={styles.trackHeader}>
              <Text style={styles.trackIndex}>Track {i + 1}</Text>
              {tracks.length > 1 && (
                <TouchableOpacity onPress={() => setTracks((cur) => cur.filter((t) => t.localId !== track.localId))}>
                  <Text style={styles.removeTrack}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              value={track.title}
              onChangeText={(v) => updateTrack(track.localId, { title: v })}
              placeholder={releaseType === "SINGLE" ? title || "Track title" : "Track title"}
              placeholderTextColor={colors.ink3}
              style={styles.trackInput}
            />
            <AudioPickerBox
              state={track}
              onUploadStart={() => updateTrack(track.localId, { status: "uploading", error: undefined })}
              onIngested={(result) =>
                updateTrack(track.localId, {
                  status: "ready",
                  durationSec: result.durationSec,
                  peaks: result.peaks,
                  audioMasterKey: result.audioMasterKey,
                  audioStreamKey: result.audioStreamKey,
                  waveformPeaksKey: result.waveformPeaksKey,
                  previewLength: result.durationSec >= 30 ? 30 : "custom",
                  previewLengthCustomSec: Math.min(30, result.durationSec),
                  previewStartSec: result.previewDefaults.start,
                })
              }
              onUploadError={(message) => updateTrack(track.localId, { status: "error", error: message })}
              onReset={() =>
                updateTrack(track.localId, {
                  status: "idle",
                  durationSec: undefined,
                  peaks: undefined,
                  audioMasterKey: undefined,
                  audioStreamKey: undefined,
                  waveformPeaksKey: undefined,
                })
              }
              onPreviewChange={(patch) => updateTrack(track.localId, patch)}
            />
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitText}>Publish</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 60, gap: 20 },
  title: { color: colors.ink, fontSize: 22, fontFamily: fonts.serif },
  typeRow: { flexDirection: "row", gap: 8 },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  tracksSection: { gap: 12 },
  tracksHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLabel: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  addTrack: { color: colors.redSoft, fontSize: 12, fontWeight: "600" },
  trackCard: { borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 12, padding: 12, gap: 10 },
  trackHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  trackIndex: { color: colors.ink2, fontSize: 12, fontWeight: "600" },
  removeTrack: { color: colors.ink3, fontSize: 11.5 },
  trackInput: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.ink,
    fontSize: 13,
  },
  submitButton: { backgroundColor: colors.red, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  submitText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
});
