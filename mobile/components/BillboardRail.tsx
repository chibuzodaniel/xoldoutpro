import { useEffect, useRef, useState } from "react";
import { Animated, Image, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../lib/navigation";
import type { BillboardSlide } from "../lib/billboardTypes";
import { colors } from "../lib/theme";

const ROTATE_MS = 5000;

// Mirrors web's components/discover/BillboardRail.tsx: a rotating promo
// rail nested inside the New Release section's left column (portrait 4:5,
// not a wide banner — explicit ask on web, carried over here).
export function BillboardRail({ slides, width }: { slides: BillboardSlide[]; width: number }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

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

  if (slides.length === 0) return null;

  const slide = slides[index];
  const height = (width * 5) / 4;

  function handlePress() {
    if (slide.creator) navigation.navigate("Creator", { handle: slide.creator.handle });
  }

  return (
    <View>
      <Text style={styles.label}>Billboards</Text>
      <TouchableOpacity activeOpacity={slide.creator ? 0.85 : 1} onPress={handlePress} disabled={!slide.creator}>
        <Animated.View style={[styles.frame, { width, height, opacity }]}>
          <Image source={{ uri: slide.artworkUrl }} style={styles.image} />
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
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  dotActive: { backgroundColor: colors.redSoft },
});
