import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Live emoji reactions — mirrors web's components/live/reactions.tsx
// (explicit ask, 2026-10-04: "some emojis should be on screen in the live and
// it should be filtered according to what the user normally uses"). Usage
// counts live on this device only (AsyncStorage); losing them just falls
// back to the default order.

export const LIVE_EMOJIS = ["❤️", "🔥", "😂", "👏", "😍", "🙌", "💯", "😮", "🎉", "🙏", "😭", "🥳", "💃", "🎶", "👀", "🤯"] as const;

const BAR_SIZE = 6;
const STORAGE_KEY = "xoldout:live-emoji-usage";
const MAX_REACTIONS_PER_SECOND = 8;
const FLOAT_MS = 2600;

type Usage = Record<string, number>;

function orderByUsage(usage: Usage): string[] {
  return [...LIVE_EMOJIS].sort((a, b) => (usage[b] ?? 0) - (usage[a] ?? 0) || LIVE_EMOJIS.indexOf(a) - LIVE_EMOJIS.indexOf(b));
}

// Only the bar's own emojis affect its order, so chat text is scanned for just
// those — Hermes doesn't reliably support Unicode-property regexes, and a
// syntax error here would take down the whole Live screen.
function emojisIn(text: string): string[] {
  const found: string[] = [];
  for (const e of LIVE_EMOJIS) {
    const bare = e.replace("️", "");
    const count = text.split(bare).length - 1;
    for (let i = 0; i < count; i++) found.push(e);
  }
  return found;
}

export function isLiveEmoji(value: unknown): value is string {
  return typeof value === "string" && (LIVE_EMOJIS as readonly string[]).includes(value);
}

export function useEmojiUsage() {
  const usageRef = useRef<Usage>({});
  const [ordered, setOrdered] = useState<string[]>([...LIVE_EMOJIS]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        usageRef.current = raw ? (JSON.parse(raw) as Usage) : {};
        setOrdered(orderByUsage(usageRef.current));
      })
      .catch(() => {});
  }, []);

  const recordUse = useCallback((emojis: string[]) => {
    if (emojis.length === 0) return;
    const usage = { ...usageRef.current };
    for (const e of emojis) usage[e] = (usage[e] ?? 0) + 1;
    usageRef.current = usage;
    setOrdered(orderByUsage(usage));
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(usage)).catch(() => {});
  }, []);

  const recordFromText = useCallback((text: string) => recordUse(emojisIn(text)), [recordUse]);

  return { ordered, recordUse, recordFromText };
}

/** Drops anything over MAX_REACTIONS_PER_SECOND from one sender, per rolling second. */
export function useReactionRateLimit() {
  const seen = useRef(new Map<string, number[]>());
  return useCallback((senderId: string) => {
    const now = Date.now();
    const recent = (seen.current.get(senderId) ?? []).filter((t) => now - t < 1000);
    if (recent.length >= MAX_REACTIONS_PER_SECOND) return false;
    recent.push(now);
    seen.current.set(senderId, recent);
    return true;
  }, []);
}

type Floating = { id: string; emoji: string; left: number; drift: number };

export function useFloatingReactions() {
  const [items, setItems] = useState<Floating[]>([]);
  const push = useCallback((emoji: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setItems((cur) => [...cur.slice(-30), { id, emoji, left: Math.random() * 40, drift: (Math.random() - 0.5) * 60 }]);
    setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== id)), FLOAT_MS + 100);
  }, []);
  return { items, push };
}

function FloatingEmoji({ item }: { item: Floating }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: FLOAT_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [progress]);
  return (
    <Animated.Text
      style={[
        styles.floating,
        {
          left: item.left,
          opacity: progress.interpolate({ inputRange: [0, 0.12, 0.8, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -320] }) },
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, item.drift] }) },
            { scale: progress.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0.6, 1.1, 0.9] }) },
          ],
        },
      ]}
    >
      {item.emoji}
    </Animated.Text>
  );
}

export function FloatingReactions({ items }: { items: Floating[] }) {
  return (
    <View style={styles.floatingArea} pointerEvents="none">
      {items.map((i) => (
        <FloatingEmoji key={i.id} item={i} />
      ))}
    </View>
  );
}

export function ReactionBar({ ordered, onReact }: { ordered: string[]; onReact: (emoji: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? ordered : ordered.slice(0, BAR_SIZE);
  return (
    <View style={styles.bar}>
      {shown.map((emoji) => (
        <TouchableOpacity key={emoji} style={styles.emojiButton} onPress={() => onReact(emoji)} accessibilityLabel={`React ${emoji}`}>
          <Text style={styles.emoji}>{emoji}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.emojiButton} onPress={() => setExpanded((v) => !v)} accessibilityLabel={expanded ? "Fewer emojis" : "More emojis"}>
        <Text style={styles.more}>{expanded ? "–" : "+"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingArea: { position: "absolute", right: 8, bottom: 180, width: 80, height: 0, zIndex: 20 },
  floating: { position: "absolute", bottom: 0, fontSize: 30 },
  bar: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginHorizontal: 12, marginTop: 8 },
  emojiButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 20 },
  more: { color: "#fff", fontSize: 18, fontWeight: "600" },
});
