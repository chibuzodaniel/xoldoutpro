import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useAuth } from "../lib/AuthContext";
import { apiGet, apiPost } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";
import type { CatalogEvent } from "../lib/catalogTypes";
import { colors } from "../lib/theme";

type ScanResult = { ok: true; tierName?: string; buyer?: string } | { ok: false; error: string };

export function EventCheckInScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "EventCheckIn">>();
  const { firebaseUser } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const scannedRef = useRef(false);

  useEffect(() => {
    navigation.setOptions({ title: "Check in tickets" });
  }, [navigation]);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser.getIdToken().then(async (idToken) => {
      const data = await apiGet<{ events: CatalogEvent[] }>("/api/events", idToken);
      const match = data.events.find((e) => e.id === route.params.id);
      if (match) setEventTitle(match.title);
    });
  }, [firebaseUser, route.params.id]);

  const submitCode = useCallback(
    async (code: string) => {
      if (!firebaseUser) return;
      setBusy(true);
      setResult(null);
      try {
        const idToken = await firebaseUser.getIdToken();
        const data = await apiPost<{ tierName?: string; buyer?: string }>("/api/events/checkin", idToken, { code });
        setResult({ ok: true, tierName: data.tierName, buyer: data.buyer });
      } catch (e) {
        setResult({ ok: false, error: e instanceof Error ? e.message : "Could not check in" });
      } finally {
        setBusy(false);
      }
    },
    [firebaseUser],
  );

  async function startScanning() {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    scannedRef.current = false;
    setScanning(true);
  }

  return (
    <View style={styles.container}>
      {eventTitle && <Text style={styles.eventTitle}>{eventTitle}</Text>}

      {scanning ? (
        <View style={styles.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={(res) => {
              if (scannedRef.current) return;
              scannedRef.current = true;
              setScanning(false);
              void submitCode(res.data);
            }}
          />
        </View>
      ) : (
        <TouchableOpacity style={styles.scanButton} onPress={startScanning}>
          <Text style={styles.scanButtonText}>Scan QR code</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.orLabel}>Or enter the code manually</Text>
      <View style={styles.manualRow}>
        <TextInput
          value={manualCode}
          onChangeText={setManualCode}
          placeholder="Ticket code"
          placeholderTextColor={colors.ink3}
          autoCapitalize="none"
          style={styles.manualInput}
        />
        <TouchableOpacity
          style={[styles.checkInButton, (busy || !manualCode.trim()) && styles.checkInButtonDisabled]}
          disabled={busy || !manualCode.trim()}
          onPress={() => {
            const code = manualCode.trim();
            if (code) void submitCode(code);
          }}
        >
          {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.checkInButtonText}>Check in</Text>}
        </TouchableOpacity>
      </View>

      {result && (
        <View style={[styles.resultCard, result.ok ? styles.resultCardOk : styles.resultCardError]}>
          <Text style={result.ok ? styles.resultTextOk : styles.resultTextError}>
            {result.ok
              ? `Checked in${result.buyer ? ` ${result.buyer}` : ""}${result.tierName ? ` · ${result.tierName}` : ""}`
              : result.error}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  eventTitle: { color: colors.ink3, fontSize: 12, marginBottom: 16 },
  cameraWrap: { width: "100%", aspectRatio: 1, borderRadius: 10, overflow: "hidden", backgroundColor: "#000", marginBottom: 24 },
  scanButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginBottom: 24 },
  scanButtonText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  orLabel: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 },
  manualRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  manualInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.ink,
    fontSize: 14,
  },
  checkInButton: { backgroundColor: colors.red, borderRadius: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  checkInButtonDisabled: { opacity: 0.5 },
  checkInButtonText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  resultCard: { borderWidth: 1, borderRadius: 10, padding: 14 },
  resultCardOk: { borderColor: "rgba(63,158,107,0.4)" },
  resultCardError: { borderColor: "rgba(225,29,46,0.4)" },
  resultTextOk: { color: colors.green, fontSize: 13 },
  resultTextError: { color: colors.redSoft, fontSize: 13 },
});
