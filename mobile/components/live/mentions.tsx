import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { InitialsAvatar } from "./LiveBits";

// @-mentions in Live chat — mirrors web's components/live/mentions.tsx
// (explicit ask, 2026-10-04: "live host can tag a user in the live
// comments"). Receivers only honour mentions on a message whose sending
// participant is the host; anyone else's "@name" is just text.

export type ChatMention = { userId: string; handle: string; displayName: string };
export type MentionCandidate = ChatMention & { avatarUrl: string | null };

export function activeMentionQuery(text: string): string | null {
  const match = /(?:^|\s)@([\w.]*)$/.exec(text);
  return match ? match[1].toLowerCase() : null;
}

export function filterCandidates(candidates: MentionCandidate[], query: string): MentionCandidate[] {
  return candidates
    .filter((c) => c.handle && (c.handle.toLowerCase().startsWith(query) || c.displayName.toLowerCase().includes(query)))
    .slice(0, 5);
}

export function insertMention(text: string, candidate: MentionCandidate): string {
  return text.replace(/@([\w.]*)$/, `@${candidate.handle} `);
}

export function extractMentions(text: string, candidates: MentionCandidate[]): ChatMention[] {
  const seen = new Set<string>();
  const out: ChatMention[] = [];
  for (const c of candidates) {
    if (!c.handle || seen.has(c.userId)) continue;
    const re = new RegExp(`(^|\\s)@${c.handle.replace(/[.]/g, "\\.")}(?=$|[\\s.,!?])`, "i");
    if (re.test(text)) {
      seen.add(c.userId);
      out.push({ userId: c.userId, handle: c.handle, displayName: c.displayName });
    }
  }
  return out;
}

/** Chat text with each tagged @handle highlighted — render inside a <Text>. */
export function MentionText({ text, mentions }: { text: string; mentions?: ChatMention[] }) {
  if (!mentions || mentions.length === 0) return <>{text}</>;
  const handles = new Set(mentions.map((m) => m.handle.toLowerCase()));
  return (
    <>
      {text.split(/(@[\w.]+)/g).map((part, i) =>
        part.startsWith("@") && handles.has(part.slice(1).toLowerCase()) ? (
          <Text key={i} style={styles.mention}>
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        ),
      )}
    </>
  );
}

export function MentionSuggestions({ candidates, onPick }: { candidates: MentionCandidate[]; onPick: (c: MentionCandidate) => void }) {
  if (candidates.length === 0) return null;
  return (
    <View style={styles.list}>
      {candidates.map((c) => (
        <TouchableOpacity key={c.userId} style={styles.row} onPress={() => onPick(c)}>
          <InitialsAvatar name={c.displayName || "?"} avatarUrl={c.avatarUrl} size={28} />
          <Text style={styles.name} numberOfLines={1}>
            {c.displayName}
          </Text>
          <Text style={styles.handle}>@{c.handle}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  mention: { color: "#d99a2b", fontWeight: "700" },
  list: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(0,0,0,0.85)",
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  name: { flex: 1, color: "#fff", fontSize: 14 },
  handle: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
});
