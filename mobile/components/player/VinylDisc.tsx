import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, View, StyleSheet } from "react-native";
import { Svg, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { colors } from "../../lib/theme";

const PERIOD_MS = 9000;
const GROOVES = 14;

// Mirrors web's components/player/VinylDisc.tsx (explicit ask, 2026-10-21:
// "vinyl feeling with the rotating disc"). The cover is the record's label,
// grooved vinyl rims it, and only the record turns; the sheen stays still on
// top. Pausing stops the record where it is — resuming carries on from that
// angle instead of snapping back to the start.
export function VinylDisc({ artworkUrl, spinning, size }: { artworkUrl: string | null; spinning: boolean; size: number }) {
  const rotation = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!spinning || reduceMotion) {
      rotation.stopAnimation();
      return;
    }
    let cancelled = false;
    const spinFrom = (start: number) => {
      rotation.setValue(start);
      Animated.timing(rotation, {
        toValue: 1,
        duration: Math.max(1, (1 - start) * PERIOD_MS),
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !cancelled) spinFrom(0);
      });
    };
    rotation.stopAnimation((value) => spinFrom(value % 1));
    return () => {
      cancelled = true;
      rotation.stopAnimation();
    };
  }, [spinning, reduceMotion, rotation]);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const r = size / 2;
  const label = size * 0.86;

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[styles.record, { width: size, height: size, borderRadius: r, transform: [{ rotate }] }]}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          {Array.from({ length: GROOVES }, (_, i) => (
            <Circle key={i} cx={r} cy={r} r={r - 1 - i * ((r * 0.07) / GROOVES) * 1.6} stroke="#26262c" strokeWidth={0.9} fill="none" />
          ))}
        </Svg>
        <View style={[styles.label, { width: label, height: label, borderRadius: label / 2 }]}>
          {artworkUrl ? <Image source={{ uri: artworkUrl }} style={styles.art} /> : <View style={[styles.art, { backgroundColor: colors.surface2 }]} />}
        </View>
        <View style={[styles.hole, { width: size * 0.05, height: size * 0.05, borderRadius: size * 0.025 }]} />
      </Animated.View>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#fff" stopOpacity="0" />
            <Stop offset="0.3" stopColor="#fff" stopOpacity="0.1" />
            <Stop offset="0.45" stopColor="#fff" stopOpacity="0" />
            <Stop offset="1" stopColor="#fff" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill="url(#sheen)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  record: {
    backgroundColor: "#0d0d0f",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  label: { overflow: "hidden", borderWidth: 1, borderColor: "rgba(0,0,0,0.6)" },
  art: { width: "100%", height: "100%" },
  hole: { position: "absolute", backgroundColor: colors.bg, borderWidth: 2, borderColor: "rgba(0,0,0,0.5)" },
});
