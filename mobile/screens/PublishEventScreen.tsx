import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { useAuth } from "../lib/AuthContext";
import { apiPost } from "../lib/api";
import { colors, fonts } from "../lib/theme";
import type { RootStackParamList } from "../lib/navigation";
import { SquareImagePicker } from "../components/creator/SquareImagePicker";
import { LabeledInput } from "../components/creator/LabeledInput";
import { CapField } from "../components/creator/CapField";
import { Pill } from "../components/creator/Pill";
import { DateTimeField } from "../components/creator/DateTimeField";

type TierDraft = { localId: string; name: string; priceNaira: string; hasCap: boolean; capValue: string };

function newTier(name = ""): TierDraft {
  return { localId: Math.random().toString(36).slice(2), name, priceNaira: "", hasCap: false, capValue: "" };
}

export function PublishEventScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [venue, setVenue] = useState("");
  const [isVirtual, setIsVirtual] = useState(false);
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const [coverLadder, setCoverLadder] = useState<Record<string, string> | null>(null);
  const [tiers, setTiers] = useState<TierDraft[]>([newTier("General")]);
  const [submitting, setSubmitting] = useState(false);

  function updateTier(localId: string, patch: Partial<TierDraft>) {
    setTiers((cur) => cur.map((t) => (t.localId === localId ? { ...t, ...patch } : t)));
  }

  async function handleSubmit() {
    if (!firebaseUser) return;
    if (!title.trim()) return Alert.alert("Missing title", "Give this event a title.");
    if (!coverLadder) return Alert.alert("Missing cover", "Add a cover image before publishing.");
    if (!startsAt) return Alert.alert("Missing start", "Set a start date and time.");
    if (!isVirtual && !venue.trim()) return Alert.alert("Missing venue", "Add a venue, or mark this a virtual event.");
    if (tiers.length === 0) return Alert.alert("Missing tiers", "Add at least one ticket tier.");

    const parsedTiers: { name: string; priceKobo: number; cap: number | null }[] = [];
    for (const t of tiers) {
      if (!t.name.trim()) return Alert.alert("Missing tier name", "Every tier needs a name.");
      const priceKobo = Math.round(parseFloat(t.priceNaira || "0") * 100);
      if (!t.priceNaira || priceKobo < 0) return Alert.alert("Missing price", `Set a price for "${t.name}", or 0 for free.`);
      const cap = t.hasCap ? parseInt(t.capValue, 10) : null;
      if (t.hasCap && (!t.capValue || !Number.isInteger(cap) || (cap as number) <= 0)) {
        return Alert.alert("Invalid quantity", `Enter a valid quantity for "${t.name}".`);
      }
      parsedTiers.push({ name: t.name.trim(), priceKobo, cap });
    }

    setSubmitting(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const payload = {
        title,
        description,
        coverImageLadder: coverLadder,
        venue: isVirtual ? undefined : venue,
        isVirtual,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt ? endsAt.toISOString() : undefined,
        tiers: parsedTiers,
      };
      await apiPost("/api/events", idToken, payload);
      Alert.alert("Published", "Your event is live.", [{ text: "OK", onPress: () => navigation.navigate("Tabs") }]);
    } catch (e) {
      Alert.alert("Could not publish", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Create Event</Text>

      <SquareImagePicker label="Cover image" placeholder="Add a cover image" ladder={coverLadder} onChange={setCoverLadder} wide />

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

      <View style={styles.venueSection}>
        <Text style={styles.sectionLabel}>Venue</Text>
        <View style={styles.venueRow}>
          <Pill label="Virtual event" active={isVirtual} onPress={() => setIsVirtual((v) => !v)} />
        </View>
        {!isVirtual && (
          <TextInput
            value={venue}
            onChangeText={setVenue}
            placeholder="Venue name and address"
            placeholderTextColor={colors.ink3}
            style={styles.venueInput}
          />
        )}
      </View>

      <DateTimeField label="Starts" value={startsAt} onChange={setStartsAt} />
      <DateTimeField label="Ends (optional)" value={endsAt} onChange={setEndsAt} clearable />

      <View style={styles.tiersSection}>
        <View style={styles.tiersHeader}>
          <Text style={styles.sectionLabel}>Ticket tiers</Text>
          {tiers.length < 10 && (
            <TouchableOpacity onPress={() => setTiers((cur) => [...cur, newTier()])}>
              <Text style={styles.addTier}>+ Add tier</Text>
            </TouchableOpacity>
          )}
        </View>

        {tiers.map((tier) => (
          <View key={tier.localId} style={styles.tierCard}>
            <View style={styles.tierNameRow}>
              <TextInput
                value={tier.name}
                onChangeText={(v) => updateTier(tier.localId, { name: v })}
                placeholder="Tier name (e.g. Early Bird)"
                placeholderTextColor={colors.ink3}
                style={styles.tierNameInput}
              />
              {tiers.length > 1 && (
                <TouchableOpacity onPress={() => setTiers((cur) => cur.filter((t) => t.localId !== tier.localId))}>
                  <Text style={styles.removeTier}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.tierPriceRow}>
              <Text style={styles.naira}>₦</Text>
              <TextInput
                value={tier.priceNaira}
                onChangeText={(v) => updateTier(tier.localId, { priceNaira: v })}
                keyboardType="numeric"
                placeholder="0 for free"
                placeholderTextColor={colors.ink3}
                style={styles.tierPriceInput}
              />
            </View>
            <CapField
              hasCap={tier.hasCap}
              onHasCapChange={(v) => updateTier(tier.localId, { hasCap: v })}
              capValue={tier.capValue}
              onCapValueChange={(v) => updateTier(tier.localId, { capValue: v })}
              cappedLabel="Limited"
              placeholder="e.g. 100"
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
  textArea: { minHeight: 70, textAlignVertical: "top" },
  sectionLabel: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  venueSection: { gap: 8 },
  venueRow: { flexDirection: "row" },
  venueInput: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.ink,
    fontSize: 14,
  },
  tiersSection: { gap: 12 },
  tiersHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addTier: { color: colors.redSoft, fontSize: 12, fontWeight: "600" },
  tierCard: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, gap: 12 },
  tierNameRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  tierNameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.ink,
    fontSize: 13,
  },
  removeTier: { color: colors.ink3, fontSize: 11.5 },
  tierPriceRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  naira: { color: colors.ink3, fontSize: 14 },
  tierPriceInput: {
    width: 110,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.ink,
    fontSize: 13,
  },
  submitButton: { backgroundColor: colors.red, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  submitText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
});
