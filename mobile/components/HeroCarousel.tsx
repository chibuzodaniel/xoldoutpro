import { useEffect, useRef, useState } from "react";
import { AppState, FlatList, TouchableOpacity, View, StyleSheet, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import type { ProductCardData } from "../lib/discoverTypes";
import { colors } from "../lib/theme";
import { HeroCard } from "./HeroCard";

// Discover hero as a billboard (explicit ask, 2026-11-04) — mirrors web's
// components/discover/HeroCarousel.tsx: the week's top 3 sellers, swiping
// automatically, with dots. Local timer only (paused in the background).

const INTERVAL_MS = 5000;

export function HeroCarousel({
  slides,
  onOpen,
}: {
  slides: { product: ProductCardData; weeklySold: number; totalSold?: number }[];
  onOpen: (id: string) => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = width - 32;
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const pausedUntil = useRef(0);

  useEffect(() => {
    if (slides.length < 2) return;
    let active = AppState.currentState === "active";
    const sub = AppState.addEventListener("change", (s) => (active = s === "active"));
    const t = setInterval(() => {
      if (!active || Date.now() < pausedUntil.current) return;
      const next = (indexRef.current + 1) % slides.length;
      listRef.current?.scrollToOffset({ offset: next * cardWidth, animated: true });
      indexRef.current = next;
      setIndex(next);
    }, INTERVAL_MS);
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [slides.length, cardWidth]);

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
    indexRef.current = i;
    setIndex(i);
  }

  return (
    <View style={[styles.wrap, { width: cardWidth }]}>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(s) => s.product.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => (pausedUntil.current = Date.now() + INTERVAL_MS * 2)}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, i) => ({ length: cardWidth, offset: cardWidth * i, index: i })}
        renderItem={({ item, index: i }) => (
          <TouchableOpacity activeOpacity={0.9} onPress={() => onOpen(item.product.id)}>
            <HeroCard hero={item.product} heroWeeklySold={item.weeklySold} totalSold={item.totalSold} rank={slides.length > 1 ? i + 1 : undefined} width={cardWidth} />
          </TouchableOpacity>
        )}
      />
      {slides.length > 1 && (
        <View style={styles.dots} pointerEvents="none">
          {slides.map((s, i) => (
            <View key={s.product.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "center", borderRadius: 12, overflow: "hidden", position: "relative", backgroundColor: colors.surface2 },
  dots: { position: "absolute", bottom: 10, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.45)" },
  dotActive: { width: 20, backgroundColor: "#fff" },
});
