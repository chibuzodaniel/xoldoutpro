import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, AppState, Image, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Svg, Circle, Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { API_BASE_URL } from "../lib/api";
import type { RootStackParamList } from "../lib/navigation";
import type { BillboardSlide } from "../lib/billboardTypes";
import { colors } from "../lib/theme";

const ROTATE_MS = 5000;
// Batched: one beacon a minute per viewer (plus on page hide), not one per
// impression — every beacon is a Vercel function invocation.
const FLUSH_MS = 60000;

const KIND_LABEL: Record<string, string> = { RELEASE: "Song", BEAT: "Beat", MERCH: "Merch", EVENT: "Event" };

function compactCount(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function sendViews(counts: Record<string, number>) {
  if (Object.keys(counts).length === 0) return;
  fetch(`${API_BASE_URL}/api/billboards/views`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ counts }),
  }).catch(() => {});
}

// Mirrors web's components/discover/BillboardRail.tsx: a rotating promo
// rail nested inside the New Release section's left column (portrait 4:5,
// not a wide banner — explicit ask on web, carried over here). Taps open the
// billboard's promoted song/beat/merch/event when it has one, else the
// creator's profile. Every time a slide is shown while Discover is the
// focused screen and the app is in the foreground counts as one view (same
// "every impression, not unique viewers" rule as web), batched every 60s.
export function BillboardRail({ slides, width }: { slides: BillboardSlide[]; width: number }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const [index, setIndex] = useState(0);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const [localViews, setLocalViews] = useState<Record<string, number>>({});
  const pendingRef = useRef<Record<string, number>>({});
  const opacity = useRef(new Animated.Value(1)).current;

  const flush = useCallback(() => {
    const counts = pendingRef.current;
    pendingRef.current = {};
    sendViews(counts);
  }, []);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
        setIndex((i) => (i + 1) % slides.length);
        Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      });
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [slides.length, opacity]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
      if (state !== "active") flush();
    });
    const id = setInterval(flush, FLUSH_MS);
    return () => {
      sub.remove();
      clearInterval(id);
      flush();
    };
  }, [flush]);

  const currentId = slides[index]?.id;
  useEffect(() => {
    if (!currentId || !isFocused || !appActive) return;
    pendingRef.current[currentId] = (pendingRef.current[currentId] ?? 0) + 1;
    setLocalViews((v) => ({ ...v, [currentId]: (v[currentId] ?? 0) + 1 }));
  }, [currentId, isFocused, appActive]);

  if (slides.length === 0) return null;

  const slide = slides[Math.min(index, slides.length - 1)];
  const height = (width * 5) / 4;
  const target = slide.target ?? (slide.creator ? { kind: "PROFILE" as const, handle: slide.creator.handle } : null);
  const promoted = target && target.kind !== "PROFILE" ? target : null;
  const views = (slide.viewCount ?? 0) + (localViews[slide.id] ?? 0);

  function handlePress() {
    if (!target) return;
    if (target.kind === "PROFILE") navigation.navigate("Creator", { handle: target.handle });
    else if (target.kind === "EVENT") navigation.navigate("Event", { id: target.id });
    else navigation.navigate("Product", { id: target.id });
  }

  return (
    <View>
      <Text style={styles.label}>Billboards</Text>
      <TouchableOpacity activeOpacity={target ? 0.85 : 1} onPress={handlePress} disabled={!target}>
        <Animated.View style={[styles.frame, { width, height, opacity }]}>
          <Image source={{ uri: slide.artworkUrl }} style={styles.image} />
          {slide.viewCount !== undefined && (
            <View style={styles.views} accessibilityLabel={`${views} views`}>
              <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}>
                <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" strokeLinejoin="round" />
                <Circle cx={12} cy={12} r={3} />
              </Svg>
              <Text style={styles.viewsText}>{compactCount(views)}</Text>
            </View>
          )}
          {promoted && (
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.8)"]} style={styles.caption}>
              <Text style={styles.captionKind}>{KIND_LABEL[promoted.kind]}</Text>
              <Text style={styles.captionTitle} numberOfLines={1}>
                {promoted.title}
              </Text>
            </LinearGradient>
          )}
        </Animated.View>
      </TouchableOpacity>
      {slides.length > 1 && (
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <View key={s.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.ink3, fontSize: 9.5, fontWeight: "600", letterSpacing: 0.5, marginBottom: 6 },
  frame: { borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface },
  image: { width: "100%", height: "100%" },
  views: {
    position: "absolute",
    right: 6,
    top: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  viewsText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  caption: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 8, paddingBottom: 6, paddingTop: 24 },
  captionKind: { color: colors.redSoft, fontSize: 9, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  captionTitle: { color: "#fff", fontSize: 11, fontWeight: "700" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  dotActive: { backgroundColor: colors.redSoft },
});
