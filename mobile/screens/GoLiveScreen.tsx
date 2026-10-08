import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../lib/AuthContext";
import { apiGet, apiPost } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";
import { colors, fonts } from "../lib/theme";
import { BottomSheet } from "../components/live/LiveBits";
import { BroadcastIcon } from "../components/live/LiveIcons";
import { SquareImagePicker } from "../components/creator/SquareImagePicker";
import { DateTimeField } from "../components/creator/DateTimeField";

type StartLiveResponse = { session: { id: string } };
type ActiveSession = { id: string; title: string; startedAt: string };

function startedAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m ago`;
}

type PinnableProduct ={ id: string; type: "RELEASE" | "BEAT" | "MERCH"; title: string; priceKobo: number };

function formatNaira(kobo: number) {
  if (kobo === 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function GoLiveScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { firebaseUser } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPaidAccess, setIsPaidAccess] = useState(false);
  const [priceXg, setPriceXg] = useState("");
  const [coverLadder, setCoverLadder] = useState<Record<string, string> | null>(null);
  const [pinnableProducts, setPinnableProducts] = useState<PinnableProduct[] | null>(null);
  const [pinnedProductId, setPinnedProductId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Go live right away, or schedule it for later with a shareable link.
  const [mode, setMode] = useState<"now" | "schedule">("now");
  // A battle Live (explicit ask, 2026-10-08) — mirrors web's Go Live form.
  const [isBattle, setIsBattle] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<Date | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [endingActive, setEndingActive] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: "Go Live" });
  }, [navigation]);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser.getIdToken().then(async (idToken) => {
      const data = await apiGet<{ products: PinnableProduct[] }>("/api/live/pinnable-products", idToken);
      setPinnableProducts(data.products);
    });
  }, [firebaseUser]);

  // The creator's still-running Live, if any — shows "Continue / End & start
  // new" instead of the form (one Live per creator at a time). Mirrors web's
  // app/(app)/live/new/page.tsx.
  const loadActiveSession = useCallback(async () => {
    if (!firebaseUser) return null;
    try {
      const idToken = await firebaseUser.getIdToken();
      const data = await apiGet<{ session: ActiveSession | null }>("/api/live/mine", idToken);
      setActiveSession(data.session);
      return data.session;
    } catch {
      return null; // older API deploy without /api/live/mine — the 409 path below still catches it
    }
  }, [firebaseUser]);

  useEffect(() => {
    loadActiveSession();
  }, [loadActiveSession]);

  async function handleEndAndStartNew() {
    if (!firebaseUser || !activeSession) return;
    setEndingActive(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPost(`/api/live/${activeSession.id}/end`, idToken);
    } catch (e) {
      // 409 "Already ended" is fine — it's over either way.
      if (!(e instanceof Error && e.message.includes("-> 409"))) {
        Alert.alert("Could not end your Live", e instanceof Error ? e.message : "Something went wrong");
        setEndingActive(false);
        return;
      }
    }
    setActiveSession(null);
    setEndingActive(false);
  }

  async function handleStart() {
    if (!firebaseUser) return;
    if (!title.trim()) return Alert.alert("Give your Live a title");
    const price = isPaidAccess ? parseInt(priceXg, 10) : 0;
    if (isPaidAccess && (!priceXg || !Number.isInteger(price) || price <= 0)) return Alert.alert("Enter a valid XG price");
    if (mode === "schedule") {
      if (!scheduleAt) return Alert.alert("Pick a date and time");
      if (scheduleAt.getTime() < Date.now() + 5 * 60 * 1000) return Alert.alert("Schedule it at least 5 minutes from now");
    }

    setBusy(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const data = await apiPost<StartLiveResponse>("/api/live", idToken, {
        title: title.trim(),
        description: description.trim() || undefined,
        coverImageLadder: coverLadder ?? undefined,
        isPaidAccess,
        priceXg: price,
        pinnedProductId: pinnedProductId ?? undefined,
        isBattle,
        scheduledFor: mode === "schedule" && scheduleAt ? scheduleAt.toISOString() : undefined,
      });
      if (mode === "schedule") {
        // Lands on the Live's own countdown screen, which has the Share button.
        navigation.replace("LiveViewer", { id: data.session.id });
        return;
      }
      navigation.replace("LiveBroadcast", { id: data.session.id });
    } catch (e) {
      // 409 = already live (another device, or since this screen loaded).
      if (e instanceof Error && e.message.includes("-> 409") && (await loadActiveSession())) return;
      Alert.alert("Could not go live", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.modeRow}>
          {(["now", "schedule"] as const).map((m) => (
            <TouchableOpacity key={m} style={[styles.modeOption, mode === m && styles.modeOptionActive]} onPress={() => setMode(m)}>
              <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>{m === "now" ? "Go live now" : "Schedule for later"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Type of Live</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {([false, true] as const).map((b) => (
            <TouchableOpacity
              key={String(b)}
              onPress={() => setIsBattle(b)}
              style={[styles.typeOption, isBattle === b && styles.typeOptionActive]}
            >
              <Text style={styles.typeTitle}>{b ? "⚔️ Battle" : "🎙 Regular Live"}</Text>
              <Text style={styles.typeSub}>{b ? "Rap battle, face-off or contest — turns, gifts + votes, XG prize" : "Perform, chat and take gifts"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {isBattle && (
          <Text style={styles.typeHint}>
            Your Live shows as a battle. When it starts you'll pick 2–3 competitors from the people watching and set the rounds, timer and prize.
          </Text>
        )}

        {mode === "schedule" && (
          <View style={{ marginBottom: 8 }}>
            <DateTimeField label="Starts at" value={scheduleAt} onChange={setScheduleAt} />
            <Text style={styles.modeHint}>
              You get a link to share right away. Fans can set a reminder, and they plus your followers are notified the moment you start.
            </Text>
          </View>
        )}

        <SquareImagePicker label="Cover image" placeholder="Optional — add a cover image" ladder={coverLadder} onChange={setCoverLadder} wide />

        <Text style={styles.label}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="What's this Live about?"
          placeholderTextColor={colors.ink3}
          style={styles.input}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Optional"
          placeholderTextColor={colors.ink3}
          multiline
          style={[styles.input, styles.textArea]}
        />

        <TouchableOpacity style={styles.toggleRow} onPress={() => setIsPaidAccess((v) => !v)}>
          <Text style={styles.toggleLabel}>Paid access</Text>
          <View style={[styles.toggle, isPaidAccess && styles.toggleOn]}>
            <View style={[styles.toggleThumb, isPaidAccess && styles.toggleThumbOn]} />
          </View>
        </TouchableOpacity>

        {isPaidAccess && (
          <>
            <Text style={styles.label}>Price to join (XG)</Text>
            <TextInput
              value={priceXg}
              onChangeText={setPriceXg}
              keyboardType="number-pad"
              placeholder="e.g. 100"
              placeholderTextColor={colors.ink3}
              style={styles.input}
            />
          </>
        )}

        {pinnableProducts && pinnableProducts.length > 0 && (
          <>
            <Text style={styles.label}>Pin a product (optional)</Text>
            <View style={styles.pinList}>
              <TouchableOpacity
                style={[styles.pinOption, pinnedProductId === null && styles.pinOptionActive]}
                onPress={() => setPinnedProductId(null)}
              >
                <Text style={[styles.pinOptionText, pinnedProductId === null && styles.pinOptionTextActive]}>None</Text>
              </TouchableOpacity>
              {pinnableProducts.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.pinOption, pinnedProductId === p.id && styles.pinOptionActive]}
                  onPress={() => setPinnedProductId(p.id)}
                >
                  <Text style={[styles.pinOptionText, pinnedProductId === p.id && styles.pinOptionTextActive]} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Text style={styles.pinOptionPrice}>{formatNaira(p.priceKobo)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity style={styles.submitButton} onPress={handleStart} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitButtonText}>{mode === "schedule" ? "Schedule Live" : "Go Live"}</Text>}
        </TouchableOpacity>
      </ScrollView>

      <BottomSheet visible={activeSession !== null} onClose={() => navigation.goBack()}>
        {activeSession && (
          <>
            <View style={styles.promptHeader}>
              <View style={styles.promptIcon}>
                <BroadcastIcon size={20} color={colors.redSoft} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.promptTitle}>You&apos;re already live</Text>
                <Text style={styles.promptMeta} numberOfLines={1}>
                  “{activeSession.title}” · started {startedAgo(activeSession.startedAt)}
                </Text>
              </View>
            </View>
            <Text style={styles.promptBody}>Continue where you left off, or end that Live and start a new one.</Text>
            <TouchableOpacity
              style={styles.submitButton}
              disabled={endingActive}
              onPress={() => navigation.replace("LiveBroadcast", { id: activeSession.id })}
            >
              <Text style={styles.submitButtonText}>Continue live</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} disabled={endingActive} onPress={handleEndAndStartNew}>
              {endingActive ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.secondaryButtonText}>End it &amp; start new</Text>}
            </TouchableOpacity>
            <TouchableOpacity disabled={endingActive} onPress={() => navigation.goBack()}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40, gap: 0 },
  label: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8, marginTop: 16 },
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
  textArea: { minHeight: 80, textAlignVertical: "top" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20 },
  toggleLabel: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: colors.surface2, padding: 3, justifyContent: "center" },
  toggleOn: { backgroundColor: colors.red },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.ink },
  toggleThumbOn: { alignSelf: "flex-end" },
  pinList: { gap: 8 },
  pinOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pinOptionActive: { borderColor: colors.red, backgroundColor: "rgba(225,29,46,0.08)" },
  pinOptionText: { color: colors.ink2, fontSize: 13, flex: 1 },
  pinOptionTextActive: { color: colors.redSoft, fontWeight: "600" },
  pinOptionPrice: { color: colors.ink3, fontSize: 12, marginLeft: 8 },
  submitButton: { backgroundColor: colors.red, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 28 },
  submitButtonText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  modeRow: { flexDirection: "row", gap: 4, backgroundColor: colors.surface, borderRadius: 12, padding: 4, marginBottom: 16 },
  typeOption: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12 },
  typeOptionActive: { borderColor: colors.red, backgroundColor: "rgba(225,29,46,0.1)" },
  typeTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  typeSub: { color: colors.ink3, fontSize: 11, marginTop: 3 },
  typeHint: { color: colors.ink3, fontSize: 11, marginTop: 6 },
  modeOption: { flex: 1, borderRadius: 9, paddingVertical: 10, alignItems: "center" },
  modeOptionActive: { backgroundColor: colors.red },
  modeText: { color: colors.ink3, fontSize: 13, fontWeight: "700" },
  modeTextActive: { color: "#fff" },
  modeHint: { color: colors.ink3, fontSize: 11, marginTop: 6, lineHeight: 16 },
  promptHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  promptIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(225,29,46,0.15)", alignItems: "center", justifyContent: "center" },
  promptTitle: { color: colors.ink, fontSize: 24, fontFamily: fonts.serif },
  promptMeta: { color: colors.ink3, fontSize: 13, marginTop: 2 },
  promptBody: { color: colors.ink2, fontSize: 14, lineHeight: 20 },
  secondaryButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 10 },
  secondaryButtonText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  cancelText: { color: colors.ink3, fontSize: 13, textAlign: "center", marginTop: 14 },
});
